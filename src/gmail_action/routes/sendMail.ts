// src/gmail_action/routes/sendMail.ts
import type { Context } from "hono";
import { sendGmail } from "../index";

export async function sendMailRoute(c: Context) {
  try {
    const bodyData = await c.req.json();
    const { to, subject, body } = bodyData;

    if (!to || !subject || !body) {
      return c.json(
        { ok: false, error: "to, subject, body required" },
        400
      );
    }

    const result = await sendGmail.execute!({
      to,
      subject,
      body,
    });

    return c.json({
      ok: true,
      message: "Email sent successfully",
      result,
    });
  } catch (err: any) {
    console.error("❌ Send mail error:", err);
    return c.json(
      { ok: false, error: err.message || "Email failed" },
      500
    );
  }
}
