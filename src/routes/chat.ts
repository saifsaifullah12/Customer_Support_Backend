import { parseMessage } from "../utils/messageParser";
import { classifyIssue } from "../utils/classifyIssue";
import type { Context } from "hono";
import { mainSupportAgent } from "../agents/index";
import { query } from "../db/client.js";

function redactPII(text = "") {
  if (!text) return "";
  return text.replace(/\b\d{6,14}\b/g, "[number-**********]");
}

// Enhanced email detection
function detectEmailIntent(text: string): { isEmail: boolean; type: 'send' | 'reply' | null; data?: any } {
  if (!text) return { isEmail: false, type: null };
  
  try {
    const parsed = JSON.parse(text);
    
    if (parsed.to && parsed.subject && (parsed.body || parsed.bodyText)) {
      return {
        isEmail: true,
        type: 'send',
        data: {
          to: Array.isArray(parsed.to) ? parsed.to : [parsed.to],
          subject: parsed.subject,
          body: parsed.body || parsed.bodyText,
        }
      };
    }
    
    if (parsed.thread_id && (parsed.body || parsed.bodyText)) {
      return {
        isEmail: true,
        type: 'reply',
        data: {
          thread_id: parsed.thread_id,
          body: parsed.body || parsed.bodyText,
          to: parsed.to || parsed.recipient,
        }
      };
    }
  } catch {
    const lowerText = text.toLowerCase();
    const emailKeywords = [
      'send email', 'send an email', 'compose email',
      'write email', 'email to', 'send message to'
    ];
    
    if (emailKeywords.some(kw => lowerText.includes(kw))) {
      return { isEmail: true, type: 'send' };
    }
  }
  
  return { isEmail: false, type: null };
}

function detectInboxIntent(text: string): boolean {
  if (!text) return false;
  
  const lowerText = text.toLowerCase();
  const inboxKeywords = [
    'get inbox', 'show inbox', 'fetch inbox', 'my emails',
    'check inbox', 'inbox emails', 'show my emails',
    'get my emails', 'fetch emails', 'list emails'
  ];
  
  return inboxKeywords.some(kw => lowerText.includes(kw));
}

function detectReplyRequest(text: string): { 
  isReply: boolean; 
  threadId?: string;
  originalEmail?: any;
} {
  if (!text) return { isReply: false };
  
  try {
    const parsed = JSON.parse(text);
    
    if ((parsed.action === 'reply' || parsed.type === 'reply' || parsed.action === 'ai-reply') && parsed.thread_id && parsed.originalEmail) {
      return {
        isReply: true,
        threadId: parsed.thread_id,
        originalEmail: {
          from: parsed.originalEmail.from,
          subject: parsed.originalEmail.subject,
          body: parsed.originalEmail.body,
        },
      };
    }
  } catch {}
  
  return { isReply: false };
}

// IMPROVED: Track replies with more robust deduplication
const recentReplies = new Map<string, { count: number; lastTime: number; conversationId: string }>();
const REPLY_COOLDOWN_MS = 180000; // 3 minutes
const MAX_REPLIES_PER_THREAD = 1;

function canSendReply(threadId: string, conversationId: string): boolean {
  const replyInfo = recentReplies.get(threadId);
  if (!replyInfo) return true;
  
  const timeSince = Date.now() - replyInfo.lastTime;
  
  // If same conversation, definitely block
  if (replyInfo.conversationId === conversationId) {
    console.warn("⚠️ Same conversation trying to reply again:", threadId);
    return false;
  }
  
  // If cooldown period has passed, reset
  if (timeSince > REPLY_COOLDOWN_MS) {
    recentReplies.delete(threadId);
    return true;
  }
  
  // Check if we've exceeded max replies
  return replyInfo.count < MAX_REPLIES_PER_THREAD;
}

function markReplySent(threadId: string, conversationId: string): void {
  const existing = recentReplies.get(threadId);
  
  if (existing) {
    existing.count++;
    existing.lastTime = Date.now();
  } else {
    recentReplies.set(threadId, { 
      count: 1, 
      lastTime: Date.now(),
      conversationId 
    });
  }
  
  // Cleanup old entries
  setTimeout(() => {
    const info = recentReplies.get(threadId);
    if (info && info.conversationId === conversationId) {
      recentReplies.delete(threadId);
    }
  }, REPLY_COOLDOWN_MS);
}

export async function chatRoute(c: Context) {
  try {
    const body = await c.req.json();
    console.log("📨 Received message:", body);
    
    const parsed = parseMessage(body);
    const issueType = classifyIssue(parsed.text || "");
    
    const conversationId = body.conversationId || `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const userId = body.userId || "user-123";
    
    // Save conversation if new
    const existingConversation = await query(
      `SELECT id FROM conversations WHERE id = $1`,
      [conversationId]
    );
    
    if (existingConversation.length === 0) {
      const title = parsed.text 
        ? (parsed.text.length > 50 ? parsed.text.substring(0, 50) + '...' : parsed.text)
        : 'New Conversation';
      
      await query(
        `INSERT INTO conversations (id, title, user_id, created_at) 
         VALUES ($1, $2, $3, NOW())`,
        [conversationId, title, userId]
      );
    }
    
    // Save user message
    if (parsed.text) {
      const redactedText = redactPII(parsed.text);
      await query(
        `INSERT INTO conversation_messages (conversation_id, role, content, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [conversationId, 'user', redactedText]
      );
    }

    const emailIntent = detectEmailIntent(parsed.text || "");
    console.log("📧 Email intent detected:", emailIntent);

    const inboxIntent = detectInboxIntent(parsed.text || "");
    console.log("📬 Inbox intent detected:", inboxIntent);

    const replyRequest = detectReplyRequest(parsed.text || "");
    console.log("💬 AI Reply request detected:", replyRequest);

    // CRITICAL: Check for duplicate reply with improved logic
    if (replyRequest.isReply && replyRequest.threadId) {
      if (!canSendReply(replyRequest.threadId, conversationId)) {
        console.warn("⚠️ Duplicate reply blocked for thread:", replyRequest.threadId);
        
        const blockMessage = "⚠️ A reply was already sent to this email thread recently. Please wait before sending another reply.";
        
        await query(
          `INSERT INTO conversation_messages (conversation_id, role, content, created_at)
           VALUES ($1, $2, $3, NOW())`,
          [conversationId, 'assistant', blockMessage]
        );
        
        return c.json({
          ok: true,
          text: blockMessage,
          conversationId,
          userId,
          duplicate: true,
        });
      }
      
      // Mark immediately to prevent race conditions
      markReplySent(replyRequest.threadId, conversationId);
      console.log("✅ Reply marked as pending for thread:", replyRequest.threadId);
    }

    const messageContent: any[] = [];

    if (parsed.text) {
      const redactedText = redactPII(parsed.text);
      
      if (inboxIntent) {
        messageContent.push({
          type: "text",
          text: `FETCH INBOX: Use gmail_find_email tool immediately to retrieve inbox emails.

Execute the tool NOW without any explanation or confirmation.`,
        });
      }
      // CRITICAL FIX: Better prompt for AI-powered reply
      else if (replyRequest.isReply && replyRequest.originalEmail) {
        const originalEmail = replyRequest.originalEmail;
        const senderEmail = originalEmail.from.includes('<') 
          ? originalEmail.from.match(/<(.+)>/)?.[1] || originalEmail.from
          : originalEmail.from;
        const senderName = originalEmail.from.includes('<')
          ? originalEmail.from.split('<')[0].trim()
          : senderEmail.split('@')[0];
        
        messageContent.push({
          type: "text",
          text: `AI EMAIL REPLY TASK - Generate professional email reply and send it.

=== ORIGINAL EMAIL TO REPLY TO ===
From: ${originalEmail.from}
Subject: ${originalEmail.subject}
Thread ID: ${replyRequest.threadId}

Email Body:
${originalEmail.body}

=== YOUR TASK (3 STEPS) ===

STEP 1: GENERATE PROFESSIONAL REPLY (Do not show this to user)
Write a helpful, professional email response that:
- Starts with "Hi ${senderName}," (or "Hello," if unclear)
- Thanks them for reaching out about the issue
- Addresses their payment issue with empathy
- Asks for specific details needed (order number, error message, payment method, date/time)
- Offers to investigate once details are provided
- Ends with "Best regards," or "Thanks," followed by "Support Team"

Email should be 3-4 paragraphs, professional but friendly.

STEP 2: CALL gmail_reply_to_email TOOL ONCE
Use these exact parameters:
- thread_id: "${replyRequest.threadId}"
- body: [the complete professional reply you generated in Step 1]
- to: "${senderEmail}"

STEP 3: RESPOND TO USER
After tool execution, respond with ONLY:
"✅ Reply sent successfully to ${senderEmail}"

CRITICAL RULES:
- Generate a REAL professional email in Step 1 (not a placeholder message)
- Call gmail_reply_to_email EXACTLY ONE TIME
- Do NOT show the email content you generated to the user
- Do NOT include any meta-commentary or explanations
- Your final response must ONLY be: "✅ Reply sent successfully to ${senderEmail}"

Execute now.`,
        });
      }
      else if (emailIntent.isEmail && emailIntent.data) {
        if (emailIntent.type === 'send') {
          messageContent.push({
            type: "text",
            text: `EMAIL REQUEST: Use gmail_send_email tool immediately with these parameters:
to: ${JSON.stringify(emailIntent.data.to)}
subject: "${emailIntent.data.subject}"
body: "${emailIntent.data.body}"

Execute the tool NOW without any explanation or confirmation.`,
          });
        } else if (emailIntent.type === 'reply') {
          const toParam = emailIntent.data.to ? `\nto: "${emailIntent.data.to}"` : "";
          messageContent.push({
            type: "text",
            text: `EMAIL REPLY REQUEST: Use gmail_reply_to_email tool immediately with these parameters:
thread_id: "${emailIntent.data.thread_id}"
body: "${emailIntent.data.body}"${toParam}

Execute the tool NOW without any explanation or confirmation.`,
          });
        }
      } else {
        messageContent.push({
          type: "text",
          text: redactedText,
        });
      }
    }

    if (parsed.imageBase64) {
      messageContent.push({
        type: "image",
        mimeType: "image/png",
        image: `data:image/png;base64,${parsed.imageBase64}`,
      });
    }

    const messages: any = [
      {
        role: "user",
        content: messageContent,
      },
    ];

    const controller = new AbortController();
    const timeoutMs = (emailIntent.isEmail || inboxIntent || replyRequest.isReply) ? 60000 : 10000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const options = {
      userId: userId,
      conversationId: conversationId,
      signal: controller.signal,
      context: {
        appVersion: "1.0.2",
        platform: "web",
        plan: "pro",
        language: "en-IN",
        emailRequest: emailIntent.isEmail,
        emailType: emailIntent.type,
        inboxRequest: inboxIntent,
        aiReplyRequest: replyRequest.isReply,
      },
    };

    console.log("🚀 Calling agent with:", {
      ...options,
      emailIntent,
      inboxIntent,
      replyRequest,
      messagePreview: messages[0].content[0].text?.substring(0, 200)
    });

    const result = await mainSupportAgent.generateText(messages, options);
    
    clearTimeout(timeoutId);

    let responseText = typeof result?.text === "string" 
      ? result.text 
      : String(result?.text || "");

    // CLEAN UP RESPONSE FOR AI REPLIES
    if (replyRequest.isReply && replyRequest.originalEmail) {
      const senderEmail = replyRequest.originalEmail.from.includes('<') 
        ? replyRequest.originalEmail.from.match(/<(.+)>/)?.[1] || replyRequest.originalEmail.from
        : replyRequest.originalEmail.from;
      
      // Force clean success message
      responseText = `✅ Reply sent successfully to ${senderEmail}`;
    }

    // Save assistant response
    await query(
      `INSERT INTO conversation_messages (conversation_id, role, content, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [conversationId, 'assistant', responseText]
    );

    // Update conversation title if first message
    if (existingConversation.length === 0 && parsed.text) {
      const title = parsed.text.length > 50 
        ? parsed.text.substring(0, 50) + '...'
        : parsed.text;
      
      await query(
        `UPDATE conversations SET title = $1 WHERE id = $2`,
        [title, conversationId]
      );
    }

    console.log("✅ Response generated:", {
      conversationId,
      responseLength: responseText.length,
      emailSent: emailIntent.isEmail,
      inboxFetched: inboxIntent,
      aiReplySent: replyRequest.isReply,
    });

    return c.json({
      ok: true,
      issueType,
      text: responseText,
      conversationId,
      userId,
      emailSent: emailIntent.isEmail,
      inboxFetched: inboxIntent,
      aiReplySent: replyRequest.isReply,
      raw: result,
    });
  } catch (err: any) {
    const message = String(err?.message || "");

    if (message.toLowerCase().includes("guardrail") || 
        message.toLowerCase().includes("blocked")) {
      return c.json({
        ok: true,
        blocked: true,
        text: message,
      }, 200);
    }

    if (err.name === 'AbortError') {
      console.error("⏱️ Request timeout");
      return c.json({ 
        ok: false, 
        error: "Request timeout - operation took too long" 
      }, 408);
    }

    console.error("❌ Chat Route Error:", err);
    return c.json({ 
      ok: false, 
      error: "Internal Server Error",
      details: message 
    }, 500);
  }
}