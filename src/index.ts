import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { VoltAgent } from "@voltagent/core";
import { createPinoLogger } from "@voltagent/logger";
import { cors } from "hono/cors";
import { mainSupportAgent } from "./agents/index.js";
import { chatRoute } from "./routes/chat.js";
import { uploadRoute } from "./routes/upload.js";
import honoServer from "@voltagent/server-hono";
import { memory } from "./memory/index.js";
import {
  getBannedWordsRoute,
  addBannedWordRoute,
  deleteBannedWordRoute
} from "./guardrails/bannedWords.js";
import { db } from "./db/client.js";
import {
  getEvalLogsRoute,
  deleteEvalLogRoute
} from "./evals/evals";
import { sendMailRoute } from "./gmail_action/routes/sendMail";
import { getConversationHistoryRoute, getAllConversationsRoute, deleteConversationRoute } from "./history/routes/history.js";
import { executeToolRoute, getToolsRoute, getToolHistoryRoute } from "./tools/routes/executeTool";

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

// Serve the application
serve({
  port: 4000,
  fetch: app.fetch,
});

console.log("🚀 Hono API running at http://localhost:4000");
console.log("📡 CORS enabled for http://localhost:3000");
console.log("\n📊 Available Endpoints:");
console.log("  POST /chat             - Chat with support agent");
console.log("  POST /upload           - Upload images");
console.log("  GET  /health           - Health check");
console.log("  GET  /history          - Get all conversations");
console.log("  GET  /history/:id      - Get conversation details");
console.log("  POST /tools/execute    - Execute a tool");
console.log("  GET  /tools            - Get available tools");
console.log("  GET  /tools/history    - Get tool execution history");
console.log("  GET  /guardrails/*     - Guardrail management");
console.log("  GET  /evals/logs       - Evaluation logs");
console.log("  POST /send-email       - Send emails");

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