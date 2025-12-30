import { createTool } from "@voltagent/core";
import { z } from "zod";
import { getZapierClient } from "./mcpconnection";

// IMPROVED: Track with more context
const executedReplies = new Map<string, { count: number; lastTime: number; lastBody: string }>();
const EXECUTION_COOLDOWN_MS = 120000; // 2 minutes

function canExecuteReply(threadId: string, body: string): boolean {
  const lastExecution = executedReplies.get(threadId);
  if (!lastExecution) return true;
  
  const timeSince = Date.now() - lastExecution.lastTime;
  
  // If same body content, definitely block (duplicate)
  if (lastExecution.lastBody === body) {
    console.warn("⚠️ Exact duplicate reply body detected");
    return false;
  }
  
  // If within cooldown and already sent once, block
  if (timeSince < EXECUTION_COOLDOWN_MS && lastExecution.count >= 1) {
    console.warn("⚠️ Reply cooldown active");
    return false;
  }
  
  // If cooldown passed, allow
  if (timeSince > EXECUTION_COOLDOWN_MS) {
    executedReplies.delete(threadId);
    return true;
  }
  
  return true;
}

function markReplyExecuted(threadId: string, body: string): void {
  const existing = executedReplies.get(threadId);
  
  if (existing) {
    existing.count++;
    existing.lastTime = Date.now();
    existing.lastBody = body;
  } else {
    executedReplies.set(threadId, { 
      count: 1, 
      lastTime: Date.now(),
      lastBody: body
    });
  }
  
  // Cleanup
  setTimeout(() => {
    executedReplies.delete(threadId);
  }, EXECUTION_COOLDOWN_MS);
}

export const zapierReplyEmailTool: any = createTool({
  id: "gmail_reply_to_email",
  name: "gmail_reply_to_email",
  description: "Reply to an existing email thread via Gmail through Zapier MCP. Requires thread_id and the body of the reply. The tool will automatically reply to the original sender.",

  parameters: z.object({
    thread_id: z.string().describe("The Gmail thread ID to reply to"),
    body: z.string().describe("Reply message body - must be complete professional email content"),
    to: z.string().optional().describe("Optional: recipient email address"),
  }),

  execute: async ({ thread_id, body, to }) => {
    try {
      // CRITICAL: Check for duplicate execution
      if (!canExecuteReply(thread_id, body)) {
        console.warn("⚠️ Duplicate reply blocked for thread:", thread_id);
        return {
          success: false,
          error: "Reply already sent to this thread recently. Duplicate blocked.",
          thread_id: thread_id,
          duplicate: true,
        };
      }

      console.log("💬 Replying to email via Zapier MCP:", { 
        thread_id, 
        bodyLength: body.length,
        bodyPreview: body.substring(0, 100),
        to 
      });

      // CRITICAL: Validate body content
      const lowerBody = body.toLowerCase();
      if (lowerBody.includes('reply sent successfully') || 
          lowerBody.includes('✅') ||
          lowerBody.length < 20) {
        console.error("❌ Invalid email body - appears to be a status message, not email content");
        return {
          success: false,
          error: "Invalid email body: must be actual email content, not a status message",
          thread_id: thread_id,
        };
      }
      
      const client = await getZapierClient();

      let instructions: string;
      
      if (to) {
        instructions = `Reply to email thread ${thread_id} sent to ${to} with the following message: "${body}"`;
      } else {
        instructions = `Reply to email thread ${thread_id} with message: "${body}"`;
      }

      console.log("📝 Sending reply instructions");

      // Mark as executed BEFORE calling API to prevent race conditions
      markReplyExecuted(thread_id, body);

      const result = await client.callTool({
        name: "gmail_reply_to_email",
        arguments: {
          instructions: instructions,
        },
      });

      console.log("✅ Reply sent successfully");

      let resultText = "";
      if (result.content && Array.isArray(result.content)) {
        resultText = result.content
          .map((item: any) => item.text || "")
          .join(" ");
      } else if (typeof result === "string") {
        resultText = result;
      } else {
        resultText = JSON.stringify(result);
      }

      if (resultText.toLowerCase().includes("error")) {
        console.log("⚠️ Reply might have failed:", resultText);
        return {
          success: false,
          error: resultText,
          thread_id: thread_id,
        };
      }
      
      return {
        success: true,
        message: `Reply sent successfully to thread ${thread_id}`,
        result: resultText,
        thread_id: thread_id,
      };
    } catch (error: any) {
      console.error("❌ Failed to reply to email:", error);
      
      return {
        success: false,
        error: error.message || "Failed to reply to email",
        details: error.toString(),
        thread_id: thread_id,
      };
    }
  },
});