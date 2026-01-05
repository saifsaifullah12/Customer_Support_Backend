import type { Context } from "hono";
import { readInboxTool } from "../mcp/readInboxTool";
import { sendMailTool } from "../mcp/sendMailTool";

const SYSTEM_AUTH0_TOKEN = process.env.Access_Token?.replace(/^["']|["']$/g, "").trim();

/**
 * GET /mail/inbox
 * Retrieves inbox messages.
 * Uses System Token if user does not provide one (Service Account mode).
 */
export async function getInboxRoute(c: Context) {
    try {
        // 1. Try to get token from header (for Google OAuth users)
        let token = c.req.header('Authorization')?.replace('Bearer ', '');

        // 2. If no user token, fallback to System Token (for Auth users viewing shared inbox)
        if (!token && SYSTEM_AUTH0_TOKEN) {
            console.log("🔑 Using System Auth0 Token for Inbox access");
            token = SYSTEM_AUTH0_TOKEN;
        }

        if (!token) {
            return c.json({
                ok: false,
                error: "Authentication required (User Token or System Token missing)"
            }, 401);
        }

        const maxEmails = parseInt(c.req.query('max') || "20");
        console.log(`📬 Fetching inbox (max: ${maxEmails})...`);

        const result: any = await readInboxTool.execute({
            token,
            maxEmails
        });

        if (!result.success) {
            throw new Error(result.error || "Failed to fetch inbox");
        }

        // Parse the text result into a structured format if possible
        // The tool returns a string representation, we might want to structure it better in the future
        // For now, we return it as is but wrapped cleanly

        return c.json({
            ok: true,
            message: "Inbox fetched successfully",
            data: result.result, // The raw text/JSON from the tool
            count: result.emailCount,
            timestamp: new Date().toISOString()
        });

    } catch (error: any) {
        console.error("❌ Inbox route error:", error);
        return c.json({
            ok: false,
            error: error.message || "Internal Server Error"
        }, 500);
    }
}

/**
 * POST /mail/send
 * Sends an email.
 * Always uses the System Mailer (MCP) configuration.
 */
export async function sendMailRoute(c: Context) {
    try {
        const { to, subject, body } = await c.req.json();

        if (!to || !subject || !body) {
            return c.json({
                ok: false,
                error: "Missing required fields: to, subject, body"
            }, 400);
        }

        console.log(`📧 Sending email to ${to}...`);

        const result = await sendMailTool.execute({
            to,
            subject,
            body
        });

        if (!result.success) {
            throw new Error(result.error);
        }

        return c.json({
            ok: true,
            message: "Email sent successfully",
            details: result
        });

    } catch (error: any) {
        console.error("❌ Send mail route error:", error);
        return c.json({
            ok: false,
            error: error.message || "Failed to send email"
        }, 500);
    }
}
