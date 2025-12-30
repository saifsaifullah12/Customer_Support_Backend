import { createTool } from "@voltagent/core";
import { z } from "zod";
import { getZapierClient } from "./mcpconnection";

export const zapierFetchInboxTool: any = createTool({
  id: "gmail_find_email",
  name: "gmail_find_email",
  description: "Fetch emails from Gmail inbox through Zapier MCP",

  parameters: z.object({
    query: z.string().optional().describe("Search query to filter emails (optional)"),
    maxResults: z.number().optional().describe("Maximum number of emails to fetch (default: 20)"),
  }),

  execute: async ({ query = "", maxResults = 20 }) => {
    try {
      console.log("📬 Fetching inbox emails via Zapier MCP:", { query, maxResults });
      
      const client = await getZapierClient();

      // Create instructions for finding emails
      const instructions = query 
        ? `Find emails in my Gmail inbox matching query: ${query}. Limit to ${maxResults} results.`
        : `Find the latest ${maxResults} emails in my Gmail inbox.`;

      const result = await client.callTool({
        name: "gmail_find_email",
        arguments: {
          instructions: instructions,
        },
      });

      console.log("✅ Inbox emails fetched successfully:", result);

      return {
        success: true,
        emails: result.content || result,
        count: Array.isArray(result.content) ? result.content.length : 0,
      };
    } catch (error: any) {
      console.error("❌ Failed to fetch inbox emails:", error);
      return {
        success: false,
        error: error.message || "Failed to fetch inbox emails",
        details: error.toString(),
      };
    }
  },
});