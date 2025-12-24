import { parseMessage } from "../utils/messageParser";
import { classifyIssue } from "../utils/classifyIssue";
import type { Context } from "hono";
import { mainSupportAgent } from "../agents/index";
import { query } from "../db/client.js";

function redactPII(text = "") {
  if (!text) return "";
  let s = text.replace(/\b\d{6,14}\b/g, "[number-**********]");
  return s;
}

export async function chatRoute(c: Context) {
  try {
    const body = await c.req.json();
    console.log("📨 Received message:", body);
    
    const parsed = parseMessage(body);
    const issueType = classifyIssue(parsed.text || "");
    
    // Get conversation ID from request or generate one
    const conversationId = body.conversationId || `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const userId = body.userId || "user-123";
    
    // Save conversation if it doesn't exist
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
    
    // Save user message to database
    if (parsed.text) {
      const redactedText = redactPII(parsed.text);
      await query(
        `INSERT INTO conversation_messages (conversation_id, role, content, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [conversationId, 'user', redactedText]
      );
    }

    const messageContent: any[] = [];

    if (parsed.text) {
      const redactedText = redactPII(parsed.text);
      messageContent.push({
        type: "text",
        text: redactedText,
      });
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
    setTimeout(() => controller.abort(), 5000);

    const options: any = {
      userId: userId,
      conversationId: conversationId,
      signal: controller.signal,
      context: {
        appVersion: "1.0.2",
        platform: "web",
        plan: "pro",
        language: "en-IN",
      },
    };

    const result = await mainSupportAgent.generateText(messages, options);

    const responseText =
      typeof result?.text === "string" ? result.text : String(result?.text || "");

    // Save assistant response to database
    await query(
      `INSERT INTO conversation_messages (conversation_id, role, content, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [conversationId, 'assistant', responseText]
    );

    // Update conversation title if it's the first message
    if (existingConversation.length === 0 && parsed.text) {
      const title = parsed.text.length > 50 
        ? parsed.text.substring(0, 50) + '...'
        : parsed.text;
      
      await query(
        `UPDATE conversations SET title = $1 WHERE id = $2`,
        [title, conversationId]
      );
    }

    return c.json({
      ok: true,
      issueType,
      text: responseText,
      conversationId,
      userId,
      raw: result,
    });
  } catch (err: any) {
    const message = String(err?.message || "");

    if (message.toLowerCase().includes("guardrail") || message.toLowerCase().includes("blocked")) {
      return c.json(
        {
          ok: true,
          blocked: true,
          text: message,
        },
        200
      );
    }

    console.error("❌ Chat Route Error:", err);
    return c.json({ ok: false, error: "Internal Server Error" }, 500);
  }
}