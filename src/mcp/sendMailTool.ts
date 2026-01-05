import { createTool } from "@voltagent/core";
import { z } from "zod";
import { getMailMCPClient } from "./mcpconnection";

export const sendMailTool: any = createTool({
  id: "send_mail",
  name: "send_mail",
  description: "Send an email via Gmail SMTP through Mail MCP server",

  parameters: z.object({
    to: z.string().email().describe("Recipient email address"),
    subject: z.string().describe("Email subject line"),
    body: z.string().describe("Email body content"),
  }),

  execute: async ({ to, subject, body }) => {
    try {
      console.log("📧 Sending email via Mail MCP:", { to, subject });
      
      const client = await getMailMCPClient();

      const result = await client.callTool({
        name: "sendMail",
        arguments: {
          to,
          subject,
          body,
        },
      });

      console.log("✅ Email sent successfully:", result);

      // Extract text from result
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

      return {
        success: true,
        message: `Email sent successfully to ${to}`,
        result: resultText,
        to,
        subject,
      };
    } catch (error: any) {
      console.error("❌ Failed to send email:", error);
      return {
        success: false,
        error: error.message || "Failed to send email",
        details: error.toString(),
      };
    }
  },
});