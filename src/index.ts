import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { VoltAgent } from "@voltagent/core";
import { createPinoLogger } from "@voltagent/logger";
import { cors } from "hono/cors";
import { mailAgent, mainSupportAgent } from "./agents/index.js";
import { chatRoute } from "./routes/chat.js";
import { uploadRoute } from "./routes/upload.js";
import { loginRoute, signupRoute } from "./routes/auth.js";
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
import { testMailMCPConnection, getMailMCPClient } from "./mcp/mcpconnection";
import { sendMailTool } from "./mcp/sendMailTool";
import { readInboxTool } from "./mcp/readInboxTool";
import { getInboxRoute } from "./routess/inbox.js";
import {
  uploadDocumentRoute,
  searchDocumentsRoute,
  getAllDocumentsRoute,
  getDocumentRoute,
  deleteDocumentRoute,
  getStatsRoute,
  batchUploadRoute,
} from "./rag/routes/ragRoutes";

// Initialize database tables
async function initDatabase() {
  try {
    // Create users table
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✅ Database initialized successfully");
  } catch (error) {
    console.error("❌ Database initialization failed:", error);
  }
}

initDatabase().catch(console.error);

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
  origin: ["http://localhost:3000", "http://localhost:3001", "https://customersupportfrontend.vercel.app"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  exposeHeaders: ["Content-Length"],
  maxAge: 600,
  credentials: true,
}));

// Chat routes
app.post("/chat", chatRoute);
app.post("/upload", uploadRoute);

// Auth routes
app.post("/login", loginRoute);
app.post("/signup", signupRoute);

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
      hasAuth0Token: !!process.env.Access_Token,
      hasMCPServer: !!process.env.MAIL_MCP_SERVER_PATH,
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

// AI-Powered Email Send Endpoint (using your MCP server)
app.post("/email/send-with-ai", async (c) => {
  try {
    const body = await c.req.json();
    const { to, subject, context, userId } = body;

    if (!to || !subject) {
      return c.json({
        ok: false,
        error: "Missing required fields: to, subject"
      }, 400);
    }

    console.log("🤖 AI Email Send Request:", { to, subject });

    const conversationId = `send-ai-${Date.now()}`;

    // Generate AI email content using mailAgent
    const messageText = `Generate and send a professional email.

To: ${to}
Subject: ${subject}
Context: ${context || 'General inquiry'}

Write a complete professional email and send it immediately using send_mail tool.`;

    const messages: any = [
      {
        role: "user",
        content: [{ type: "text", text: messageText }]
      }
    ];

    const options = {
      userId: userId || "user-123",
      conversationId: conversationId,
      context: {
        appVersion: "1.0.2",
        platform: "web",
        plan: "pro",
        language: "en-IN",
      },
    };

    const result = await mailAgent.generateText(messages, options);

    let responseText = typeof result?.text === "string"
      ? result.text
      : String(result?.text || "");

    return c.json({
      ok: true,
      message: responseText,
      conversationId,
      sentTo: to,
    });

  } catch (error: any) {
    console.error("❌ AI Send route error:", error);
    return c.json({
      ok: false,
      error: "Failed to generate and send email",
      details: error.message
    }, 500);
  }
});

// Inbox routes
app.get("/inbox", getInboxRoute);

app.get("/inbox/refresh", async (c) => {
  try {
    const token = c.req.header('Authorization')?.replace('Bearer ', '') ||
      process.env.Access_Token?.replace(/^["']|["']$/g, "").trim();

    if (!token) {
      return c.json({
        ok: false,
        error: "Auth0 token required"
      }, 401);
    }

    const result: any = await readInboxTool.execute({ token });

    return c.json({
      ok: result.success,
      message: result.success ? "Inbox refreshed successfully" : "Failed to refresh inbox",
      count: result.emailCount || 0,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    return c.json({
      ok: false,
      error: error.message,
    }, 500);
  }
});

// Test Mail MCP connection
app.get("/test/mail-mcp", async (c) => {
  try {
    const result = await testMailMCPConnection();
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

    const result: any = await sendMailTool.execute({
      to,
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

// Test inbox fetch
app.get("/test/inbox", async (c) => {
  try {
    const token = c.req.query('token') ||
      process.env.Access_Token?.replace(/^["']|["']$/g, "").trim();

    if (!token) {
      return c.json({
        ok: false,
        error: "Auth0 token required"
      }, 401);
    }

    console.log("📬 Testing inbox fetch...");

    const result = await readInboxTool.execute({ token });

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

// View Mail MCP tool schemas
app.get("/test/mail-mcp/tools", async (c) => {
  try {
    const client = await getMailMCPClient();
    const tools = await client.listTools();

    // Get detailed schema for each tool
    const detailedTools = tools.tools?.map((tool: any) => ({
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

console.log("\n📚 RAG (Knowledge Base) Endpoints:");

app.post("/rag/upload", uploadDocumentRoute);
console.log("  POST /rag/upload               - Upload and index document");

app.post("/rag/search", searchDocumentsRoute);
console.log("  POST /rag/search               - Search knowledge base");

app.get("/rag/documents", getAllDocumentsRoute);
console.log("  GET  /rag/documents            - Get all documents");

app.get("/rag/documents/:id", getDocumentRoute);
console.log("  GET  /rag/documents/:id        - Get document by ID");

app.delete("/rag/documents/:id", deleteDocumentRoute);
console.log("  DELETE /rag/documents/:id      - Delete document");

app.get("/rag/stats", getStatsRoute);
console.log("  GET  /rag/stats                - Get RAG statistics");

app.post("/rag/batch-upload", batchUploadRoute);
console.log("  POST /rag/batch-upload         - Batch upload text documents");

// Test RAG endpoint
app.get("/test/rag", async (c) => {
  try {
    const testQuery = c.req.query('query') || "payment process";
    const { ragStorage } = await import("./rag/storage");

    const results = await ragStorage.search(testQuery, 3);

    return c.json({
      ok: true,
      message: "RAG test completed",
      query: testQuery,
      resultsCount: results.length,
      results: results.map(r => ({
        title: r.document.title,
        similarity: r.similarity,
        preview: r.chunk.chunkText.substring(0, 200) + '...',
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return c.json({
      ok: false,
      error: error.message,
      details: error.toString(),
    }, 500);
  }
});
console.log("  GET  /test/rag?query=text      - Test RAG search");

// Serve the application
serve({
  port: 4000,
  fetch: app.fetch,
});


console.log("  GET  /test/rag?query=text      - Test RAG search");

// Update the console logs at the end
console.log("\n🎯 NEW FEATURES:");
console.log("   ✅ RAG (Retrieval-Augmented Generation)");
console.log("   ✅ Semantic document search with pgvector");
console.log("   ✅ Multi-format document processing (PDF, DOCX, TXT, etc.)");
console.log("   ✅ Intelligent chunking and embedding");
console.log("   ✅ Vector similarity search");
console.log("   ✅ RAG-powered agent responses");

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
console.log("  POST /email/send-with-ai       - 🤖 AI-Powered Email Send (NEW!)");
console.log("  GET  /inbox                    - Get inbox emails");
console.log("  GET  /inbox/refresh            - Refresh inbox");
console.log("  GET  /test/mail-mcp            - Test Mail MCP connection");
console.log("  POST /test/email/send          - Test direct email send");
console.log("  GET  /test/inbox               - Test inbox fetch");
console.log("  GET  /test/mail-mcp/tools      - View Mail MCP tool schemas");

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
console.log("\n🎯 FEATURE: AI-Powered Email with Custom MCP Server");
console.log("   Your custom Mail MCP server is integrated and ready!");