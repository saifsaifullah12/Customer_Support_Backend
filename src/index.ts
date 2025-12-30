import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { VoltAgent } from "@voltagent/core";
import { createPinoLogger } from "@voltagent/logger";
import { cors } from "hono/cors";
import { mailAgent, mainSupportAgent } from "./agents/index.js";
import { chatRoute } from "./routes/chat.js";
import { uploadRoute } from "./routes/upload.js";
import honoServer from "@voltagent/server-hono";
import { memory } from "./memory/index.js";
import {
  getBannedWordsRoute,
  addBannedWordRoute,
  deleteBannedWordRoute
} from "./guardrails/bannedWords.js";
import { db, query } from "./db/client.js";
import {
  getEvalLogsRoute,
  deleteEvalLogRoute
} from "./evals/evals";
import { sendMailRoute } from "./gmail_action/routes/sendMail";
import { getConversationHistoryRoute, getAllConversationsRoute, deleteConversationRoute } from "./history/routes/history.js";
import { executeToolRoute, getToolsRoute, getToolHistoryRoute } from "./tools/routes/executeTool";
import { testZapierConnection } from "./mcp/mcpconnection";
import { zapierSendEmailTool } from "./mcp/zapierSendEmailTool";
import { zapierReplyEmailTool } from "./mcp/zapierReplyEmailTool";
import { zapierFetchInboxTool } from "./mcp/zapierFetchInboxTool";
import { getZapierClient } from "./mcp/mcpconnection";
import { getInboxRoute } from "./routess/inbox.js";

// Initialize database tables
// initDatabase().catch(console.error);

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing database pool...');
  await db.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing database pool...');
  await db.end();
  process.exit(0);
});

const app = new Hono();

app.use("/*", cors({
  origin: ["http://localhost:3000", "http://localhost:3001","https://customersupportfrontend.vercel.app"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  exposeHeaders: ["Content-Length"],
  maxAge: 600,
  credentials: true,
}));

// Chat routes
app.post("/chat", chatRoute);
app.post("/upload", uploadRoute);

// Health check
app.get("/health", (c) => {
  return c.json({ 
    status: "ok", 
    message: "Server is running",
    timestamp: new Date().toISOString(),
    services: {
      database: "connected",
      agents: "ready",
      memory: "active"
    }
  });
});

// Memory-based history (from VoltAgent memory)
app.get("/memory/history/:conversationId", async (c) => {
  const conversationId = c.req.param("conversationId");
  const history = await memory.storage.getConversation(conversationId);
  return c.json({ ok: true, history });
});

// Database-based history routes
app.get("/history/:conversationId", getConversationHistoryRoute);
app.get("/history", getAllConversationsRoute);
app.delete("/history/:conversationId", deleteConversationRoute);

// Tools routes
app.post("/tools/execute", executeToolRoute);
app.get("/tools", getToolsRoute);
app.get("/tools/history", getToolHistoryRoute);

// Guardrail routes
app.get("/guardrails/banned-words", getBannedWordsRoute);
app.post("/guardrails/banned-words", addBannedWordRoute);
app.delete("/guardrails/banned-words/:id", deleteBannedWordRoute);

// Evaluation routes
app.get("/evals/logs", getEvalLogsRoute);
app.delete("/evals/logs/:id", deleteEvalLogRoute);

// Email routes
app.post("/send-email", sendMailRoute);

app.get("/email/config", (c) => {
  return c.json({
    ok: true,
    config: {
      hasPublicKey: !!process.env.VOLTAGENT_PUBLIC_KEY,
      hasSecretKey: !!process.env.VOLTAGENT_SECRET_KEY,
      hasCredentialId: !!process.env.GMAIL_CREDENTIAL_ID,
      nodeEnv: process.env.NODE_ENV,
      serverTime: new Date().toISOString()
    }
  });
});

app.get("/email/templates", (c) => {
  const templates = {
    summary: {
      name: "Meeting Summary",
      subject: "Meeting Summary - {date}",
      body: "Dear {name},\n\nHere is the summary of our discussion on {date}:\n\n{content}\n\nKey Points:\n• {point1}\n• {point2}\n• {point3}\n\nNext Steps:\n{nextSteps}\n\nBest regards,\nSupport Team",
      placeholders: ["name", "date", "content", "point1", "point2", "point3", "nextSteps"]
    },
    followup: {
      name: "Follow-up Required",
      subject: "Follow-up: {issue}",
      body: "Dear {name},\n\nThis is a follow-up regarding: {issue}\n\nAdditional Details:\n{details}\n\nPlease let us know your thoughts or if you need any clarification.\n\nRegards,\nSupport Team",
      placeholders: ["name", "issue", "details"]
    }
  };

  return c.json({
    ok: true,
    templates,
    count: Object.keys(templates).length
  });
});

// NEW: AI-Powered Email Reply Endpoint
// Add this to your index.ts server file

// NEW: AI-Powered Email Reply Endpoint - IMPROVED VERSION
// Improved AI-Powered Email Reply Endpoint
app.post("/email/reply-with-ai", async (c) => {
  try {
    const body = await c.req.json();
    const { thread_id, originalEmail, userId } = body;

    if (!thread_id) {
      return c.json({
        ok: false,
        error: "Missing required field: thread_id"
      }, 400);
    }

    if (!originalEmail || !originalEmail.from || !originalEmail.subject || !originalEmail.body) {
      return c.json({
        ok: false,
        error: "Missing required fields in originalEmail: from, subject, body"
      }, 400);
    }

    // Check for duplicate reply in database
    const recentReply = await query(
      `SELECT id FROM conversation_messages 
       WHERE content LIKE $1 
       AND created_at > NOW() - INTERVAL '2 minutes'
       LIMIT 1`,
      [`%Reply sent successfully%${thread_id}%`]
    );

    if (recentReply.length > 0) {
      console.warn("⚠️ Duplicate AI reply blocked for thread:", thread_id);
      return c.json({
        ok: false,
        error: "A reply was already sent recently to this thread.",
        duplicate: true
      }, 429);
    }

    console.log("🤖 AI Reply Request:", { 
      thread_id, 
      from: originalEmail.from,
      subject: originalEmail.subject 
    });

    const conversationId = `reply-ai-${thread_id}-${Date.now()}`;
    const senderEmail = originalEmail.from.includes('<') 
      ? originalEmail.from.match(/<(.+)>/)?.[1] || originalEmail.from
      : originalEmail.from;
    const senderName = originalEmail.from.includes('<')
      ? originalEmail.from.split('<')[0].trim()
      : senderEmail.split('@')[0];

    // Generate AI reply using mailAgent
    const messageText = `CRITICAL: Generate and send reply ONCE ONLY.

=== ORIGINAL EMAIL ===
From: ${originalEmail.from}
Subject: ${originalEmail.subject}
Thread ID: ${thread_id}

Body:
${originalEmail.body}

=== YOUR TASK ===

Step 1: Write a professional reply email
Step 2: Call gmail_reply_to_email ONCE with thread_id "${thread_id}"
Step 3: Respond with: "✅ Reply sent successfully to ${senderEmail}"

Generate reply addressing their concerns professionally. Use proper greeting ("Hi ${senderName},"), acknowledge their issue, provide helpful info, and close professionally.

Execute now.`;

    const messages: any = [
      {
        role: "user",
        content: [{ type: "text", text: messageText }]
      }
    ];

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    const options = {
      userId: userId || "user-123",
      conversationId: conversationId,
      signal: controller.signal,
      context: {
        appVersion: "1.0.2",
        platform: "web",
        plan: "pro",
        language: "en-IN",
        aiReplyRequest: true,
      },
    };

    console.log("🤖 Generating AI reply...");

    const result = await mailAgent.generateText(messages, options);
    
    clearTimeout(timeoutId);

    let responseText = typeof result?.text === "string" 
      ? result.text 
      : String(result?.text || "");

    // Clean response - ensure it's just the success message
    if (!responseText.includes('✅ Reply sent successfully')) {
      responseText = `✅ Reply sent successfully to ${senderEmail}`;
    } else {
      // Extract just the success message
      const match = responseText.match(/✅ Reply sent successfully to .+/);
      if (match) {
        responseText = match[0];
      }
    }

    // Save to database
    await query(
      `INSERT INTO conversation_messages (conversation_id, role, content, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [conversationId, 'assistant', responseText]
    );

    console.log("✅ AI Reply sent successfully");

    return c.json({
      ok: true,
      message: responseText,
      conversationId,
      thread_id,
      aiReplySent: true,
    });

  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.error("⏱️ Request timeout");
      return c.json({ 
        ok: false, 
        error: "Request timeout - AI reply generation took too long" 
      }, 408);
    }

    console.error("❌ AI Reply route error:", error);
    return c.json({
      ok: false,
      error: "Failed to generate and send AI reply",
      details: error.message
    }, 500);
  }
});

// Inbox routes
app.get("/inbox", getInboxRoute);

app.get("/inbox/refresh", async (c) => {
  try {
    const result: any = await zapierFetchInboxTool.execute({
      query: "",
      maxResults: 20,
    });
    
    return c.json({
      ok: result.success,
      message: result.success ? "Inbox refreshed successfully" : "Failed to refresh inbox",
      count: result.count || 0,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    return c.json({
      ok: false,
      error: error.message,
    }, 500);
  }
});

// Test Zapier connection
app.get("/test/zapier", async (c) => {
  try {
    const result = await testZapierConnection();
    return c.json({
      ok: true,
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    return c.json({
      ok: false,
      error: error.message
    }, 500);
  }
});

// Test direct email send (bypasses agent)
app.post("/test/email/send", async (c) => {
  try {
    const body = await c.req.json();
    const { to, subject, bodyText } = body;

    if (!to || !subject || !bodyText) {
      return c.json({
        ok: false,
        error: "Missing required fields: to, subject, bodyText"
      }, 400);
    }

    console.log("📧 Testing direct email send:", { to, subject });

    const result: any = await zapierSendEmailTool.execute({
      to: Array.isArray(to) ? to : [to],
      subject,
      body: bodyText,
    });

    return c.json({
      ok: true,
      message: "Email test completed",
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error("❌ Email test failed:", error);
    return c.json({
      ok: false,
      error: error.message,
      details: error.toString()
    }, 500);
  }
});

// Test direct email reply (bypasses agent)
app.post("/test/email/reply", async (c) => {
  try {
    const body = await c.req.json();
    const { thread_id, bodyText, to } = body;

    if (!thread_id || !bodyText) {
      return c.json({
        ok: false,
        error: "Missing required fields: thread_id, bodyText"
      }, 400);
    }

    console.log("💬 Testing direct email reply:", { thread_id, to });

    const result = await zapierReplyEmailTool.execute({
      thread_id,
      body: bodyText,
      to,
    });

    return c.json({
      ok: true,
      message: "Email reply test completed",
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error("❌ Email reply test failed:", error);
    return c.json({
      ok: false,
      error: error.message,
      details: error.toString()
    }, 500);
  }
});

// Test inbox fetch
app.get("/test/inbox", async (c) => {
  try {
    console.log("📬 Testing inbox fetch...");
    
    const result = await zapierFetchInboxTool.execute({
      query: "",
      maxResults: 5,
    });
    
    return c.json({
      ok: true,
      message: "Inbox test completed",
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error("❌ Inbox test failed:", error);
    return c.json({
      ok: false,
      error: error.message,
      details: error.toString()
    }, 500);
  }
});

// View Zapier tool schemas
app.get("/test/zapier/tools", async (c) => {
  try {
    const client = await getZapierClient();
    const tools = await client.listTools();
    
    // Get detailed schema for each tool
    const detailedTools = tools.tools?.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));

    return c.json({
      ok: true,
      toolCount: tools.tools?.length || 0,
      tools: detailedTools,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    return c.json({
      ok: false,
      error: error.message
    }, 500);
  }
});

// Serve the application
serve({
  port: 4000,
  fetch: app.fetch,
});

console.log("🚀 Hono API running at http://localhost:4000");
console.log("📡 CORS enabled for http://localhost:3000");
console.log("\n📊 Available Endpoints:");
console.log("  POST /chat                     - Chat with support agent");
console.log("  POST /upload                   - Upload images");
console.log("  GET  /health                   - Health check");
console.log("  GET  /history                  - Get all conversations");
console.log("  GET  /history/:id              - Get conversation details");
console.log("  DELETE /history/:id            - Delete conversation");
console.log("  POST /tools/execute            - Execute a tool");
console.log("  GET  /tools                    - Get available tools");
console.log("  GET  /tools/history            - Get tool execution history");
console.log("  GET  /guardrails/banned-words  - Get banned words list");
console.log("  POST /guardrails/banned-words  - Add banned word");
console.log("  DELETE /guardrails/banned-words/:id - Delete banned word");
console.log("  GET  /evals/logs               - Get evaluation logs");
console.log("  DELETE /evals/logs/:id         - Delete evaluation log");
console.log("  POST /send-email               - Send emails");
console.log("  GET  /email/config             - Get email configuration");
console.log("  GET  /email/templates          - Get email templates");
console.log("  POST /email/reply-with-ai      - 🤖 AI-Powered Email Reply (NEW!)");
console.log("  GET  /inbox                    - Get inbox emails");
console.log("  GET  /inbox/refresh            - Refresh inbox");
console.log("  GET  /test/zapier              - Test Zapier MCP connection");
console.log("  POST /test/email/send          - Test direct email send");
console.log("  POST /test/email/reply         - Test direct email reply");
console.log("  GET  /test/inbox               - Test inbox fetch");
console.log("  GET  /test/zapier/tools        - View Zapier tool schemas");

const logger = createPinoLogger({
  name: "my-agent-server",
  level: "info",
});

new VoltAgent({
  agents: {
    assistant: mainSupportAgent
  },
  server: honoServer({ port: 4310 }),
  logger,
});

console.log("\n⚡ VoltAgent running at http://localhost:4310");
console.log("✅ System initialized successfully!");
console.log("\n🎯 NEW FEATURE: AI-Powered Email Replies");
console.log("   Use POST /email/reply-with-ai to generate intelligent replies");
console.log("   The AI will analyze the email and generate a contextual response");