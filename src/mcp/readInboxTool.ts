import { createTool } from "@voltagent/core";
import { z } from "zod";
import { getMailMCPClient } from "./mcpconnection";

export const readInboxTool: any = createTool({
  id: "read_inbox",
  name: "read_inbox",
  description: "Read Gmail inbox emails through Mail MCP server (requires Auth0 JWT token)",

  parameters: z.object({
    token: z.string().describe("Auth0 JWT access token for authentication"),
    maxEmails: z.number().optional().default(50).describe("Maximum number of emails to fetch (default: 50)"),
  }),

  execute: async ({ token, maxEmails = 50 }) => {
    try {
      console.log(`📬 Reading last ${maxEmails} emails via Mail MCP`);
      
      const client = await getMailMCPClient();

      const result = await client.callTool({
        name: "readInbox",
        arguments: {
          token,
          maxEmails,
        },
      });

      console.log("✅ Inbox fetched successfully");

      // Extract text from result
      let resultText = "";
      if (result.content && Array.isArray(result.content)) {
        resultText = result.content
          .map((item: any) => item.text || "")
          .join("\n");
      } else if (typeof result === "string") {
        resultText = result;
      } else {
        resultText = JSON.stringify(result);
      }

      // Check for ACTUAL errors in response
      const isActualError = (
        resultText.startsWith("❌") || 
        resultText.startsWith("Error:") ||
        resultText.includes("Failed to") ||
        (resultText.includes("❌ Error:") && !resultText.includes("📬 Inbox"))
      );

      if (isActualError) {
        console.log("⚠️ Inbox fetch failed:", resultText);
        return {
          success: false,
          error: resultText,
        };
      }

      // Parse email count from response
      const countMatch = resultText.match(/Total:\s*(\d+)\s*messages/i);
      const emailCount = countMatch ? parseInt(countMatch[1]) : 0;

      console.log(`✅ Successfully fetched ${emailCount} emails`);

      return {
        success: true,
        message: "Inbox fetched successfully",
        result: resultText,
        emailCount,
      };
    } catch (error: any) {
      console.error("❌ Failed to read inbox:", error);
      return {
        success: false,
        error: error.message || "Failed to read inbox",
        details: error.toString(),
      };
    }
  },
});