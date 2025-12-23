import { parseMessage } from "../utils/messageParser";
import { classifyIssue } from "../utils/classifyIssue";
import type { Context } from "hono";
import { mainSupportAgent } from "../agents/index";

function redactPII(text = "") {
  if (!text) return "";
  let s = text.replace(/\b\d{6,14}\b/g, "[number-**********]");
  s = s.replace(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    "[email-********@gmail.com]"
  );
  return s;
}

export async function chatRoute(c: Context) {
  try {
    const body = await c.req.json();
    console.log("📨 Received message:", body);
    const parsed = parseMessage(body);

    const issueType = classifyIssue(parsed.text || "");

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
      userId: body.userId || "user-123",
      conversationId: body.conversationId || "chat-001",
      signal: controller.signal,
      context: {
        appVersion: "1.0.2",
        platform: "web",
        plan: "pro",
        language: "en-IN",
      },
    };

    // Evaluation now happens automatically through agent's eval config
    const result = await mainSupportAgent.generateText(messages, options);

    const responseText =
      typeof result?.text === "string" ? result.text : String(result?.text || "");

    return c.json({
      ok: true,
      issueType,
      text: responseText,
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