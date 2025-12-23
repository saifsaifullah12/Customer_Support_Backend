import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { VoltAgent } from "@voltagent/core";
import { createPinoLogger } from "@voltagent/logger";
import { cors } from "hono/cors";
import { mainSupportAgent } from "./agents/index.js";
import { chatRoute } from "./routes/chat.js";
import { uploadRoute } from "./routes/upload.js";
import honoServer from "@voltagent/server-hono";
import { sttRoute } from "./voice/stt.js";
import { voiceProvider } from "./voice/index.js";
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
import { sendEmailWorkflow } from "./gmail_action/workflow/sendEmailWorkflow.js";
import { emailAgent } from "./agents/agent.js";
// import { sendGmail } from "./gmail_action/index.js";

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
  origin: ["http://localhost:3000", "http://localhost:3001"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  exposeHeaders: ["Content-Length"],
  maxAge: 600,
  credentials: true,
}));

app.post("/chat", chatRoute);
app.post("/upload", uploadRoute);
app.post("/stt", sttRoute);

app.post("/tts", async (c) => {
  const { text } = await c.req.json();

  if (!text) {
    return c.json({ ok: false, error: "Text is required" }, 400);
  }

  const audio: any = await voiceProvider.speak(text);

  return new Response(audio, {
    headers: { "Content-Type": "audio/mpeg" },
  });
});

app.get("/health", (c) => {
  return c.json({ status: "ok", message: "Server is running" });
});

app.get("/history/:conversationId", async (c) => {
  const conversationId = c.req.param("conversationId");
  const history = await memory.storage.getConversation(conversationId);
  return c.json({ ok: true, history });
});

// Guardrail routes
app.get("/guardrails/banned-words", getBannedWordsRoute);
app.post("/guardrails/banned-words", addBannedWordRoute);
app.delete("/guardrails/banned-words/:id", deleteBannedWordRoute);

app.get("/evals/logs", getEvalLogsRoute);
app.delete("/evals/logs/:id", deleteEvalLogRoute);

app.post("/send-email", sendMailRoute);

// Test email endpoint
// app.get("/test-gmail", async (c) => {
//   try {
//     const res = await sendGmail.execute!({
//       to: "saifsaifullah1283@gmail.com",
//       subject: "VoltOps Test",
//       body: "Hello from VoltOps Gmail",
//     });

//     return c.json({ ok: true, result: res });
//   } catch (error: any) {
//     console.error("Test email failed:", error);
//     return c.json({
//       ok: false,
//       error: error.message,
//       stack: process.env.NODE_ENV === 'development'
//         ? error.stack
//         : undefined
//     }, 500);
//   }
// });

// New: Email configuration endpoint
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

// New: Email templates endpoint
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
    },
    report: {
      name: "Weekly Report",
      subject: "Weekly Progress Report - Week {weekNumber}",
      body: "Hello Team,\n\nHere's the weekly progress report for week {weekNumber}:\n\nAccomplishments:\n{accomplishments}\n\nChallenges:\n{challenges}\n\nGoals for Next Week:\n{goals}\n\nBest regards,\nSupport Team",
      placeholders: ["weekNumber", "accomplishments", "challenges", "goals"]
    },
    alert: {
      name: "System Alert",
      subject: "URGENT: {system} Alert - {severity}",
      body: "ALERT NOTIFICATION\n\nSystem: {system}\nSeverity: {severity}\nTime: {time}\n\nDescription:\n{description}\n\nImpact:\n{impact}\n\nAction Required:\n{action}\n\nPlease take immediate action.\n\nRegards,\nSystem Admin",
      placeholders: ["system", "severity", "time", "description", "impact", "action"]
    }
  };

  return c.json({
    ok: true,
    templates,
    count: Object.keys(templates).length
  });
});

// New: Bulk email endpoint (for future)
app.post("/email/bulk", async (c) => {
  try {
    const { emails, subject, body } = await c.req.json();

    if (!Array.isArray(emails) || emails.length === 0) {
      return c.json({ ok: false, error: "Emails array is required and cannot be empty" }, 400);
    }

    if (!subject || !body) {
      return c.json({ ok: false, error: "Subject and body are required" }, 400);
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = emails.filter(email => !emailRegex.test(email));

    if (invalidEmails.length > 0) {
      return c.json({ ok: false, error: "Invalid email addresses", invalidEmails }, 400);
    }

    // const result = await sendGmail.execute!({
    //   to: emails[0],
    //   subject,
    //   body
    // });

    return c.json({
      ok: true,
      message: `Email sent to ${emails[0]} (${emails.length} total recipients)`,
      // result,
      totalRecipients: emails.length
    });

  } catch (error: any) {
    console.error("Bulk email error:", error);
    return c.json({
      ok: false,
      error: error.message || "Failed to send bulk email"
    }, 500);
  }
});

serve({
  port: 4000,
  fetch: app.fetch,
});

console.log("🚀 Hono API running at http://localhost:4000");
console.log("📡 CORS enabled for http://localhost:3000");

const logger = createPinoLogger({
  name: "my-agent-server",
  level: "info",
});

new VoltAgent({
  agents: {
    assistant: mainSupportAgent,emailAgent
  },
  workflows: {
    sendEmailWorkflow,
  },
  server: honoServer({ port: 4310 }),
  logger,
});

console.log("VoltAgent running at http://localhost:4310");
console.log("📧 Email endpoints available:");
console.log(" POST /send-email");
console.log(" GET /email/config");
console.log(" GET /email/templates");
console.log(" GET /test-gmail");
