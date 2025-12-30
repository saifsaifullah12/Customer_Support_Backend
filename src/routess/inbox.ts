import type { Context } from "hono";
import { zapierFetchInboxTool } from "../mcp/zapierFetchInboxTool";

export async function getInboxRoute(c: Context) {
  try {
    const query = c.req.query('query') || "";
    const maxResults = parseInt(c.req.query('maxResults') || "20");

    console.log("📬 Fetching inbox emails:", { query, maxResults });

    const result: any = await zapierFetchInboxTool.execute({
      query,
      maxResults,
    });

    if (result.success) {
      // Parse and format emails
      const emails = parseGmailResponse(result.emails);

      console.log("✅ Parsed emails:", emails.length);

      return c.json({
        ok: true,
        emails: emails,
        count: emails.length,
        timestamp: new Date().toISOString(),
      });
    } else {
      return c.json({
        ok: false,
        error: result.error || "Failed to fetch emails",
        details: result.details,
      }, 500);
    }
  } catch (error: any) {
    console.error("❌ Inbox route error:", error);
    return c.json({
      ok: false,
      error: "Failed to fetch inbox",
      details: error.message,
    }, 500);
  }
}

// Helper function to parse Gmail API response from Zapier MCP
function parseGmailResponse(response: any): Array<{
  id: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
  unread: boolean;
  body?: string;
}> {
  try {
    console.log("🔍 Raw response type:", typeof response);
    
    let emailData: any[] = [];
    
    // Case 1: Response is an array with content objects
    if (Array.isArray(response)) {
      // Check if it's an array of content objects
      if (response[0]?.type === 'text' && response[0]?.text) {
        try {
          const parsedText = JSON.parse(response[0].text);
          if (parsedText.results && Array.isArray(parsedText.results)) {
            emailData = parsedText.results;
          }
        } catch (e) {
          console.error("Failed to parse text content:", e);
        }
      } else {
        emailData = response;
      }
    }
    // Case 2: Response has content property
    else if (response?.content && Array.isArray(response.content)) {
      const contentItem = response.content[0];
      if (contentItem?.type === 'text' && contentItem?.text) {
        try {
          const parsedText = JSON.parse(contentItem.text);
          if (parsedText.results && Array.isArray(parsedText.results)) {
            emailData = parsedText.results;
          }
        } catch (e) {
          console.error("Failed to parse content text:", e);
        }
      }
    }
    // Case 3: Direct string response
    else if (typeof response === 'string') {
      try {
        const parsed = JSON.parse(response);
        if (parsed.results && Array.isArray(parsed.results)) {
          emailData = parsed.results;
        }
      } catch (e) {
        console.error("Failed to parse string response:", e);
      }
    }
    // Case 4: Already has results property
    else if (response?.results && Array.isArray(response.results)) {
      emailData = response.results;
    }

    console.log("📧 Parsed email count:", emailData.length);

    // Transform to frontend format
    return emailData.map((email: any) => {
      const fromEmail = email.from?.email || email.from || "unknown@example.com";
      const fromName = email.from?.name || fromEmail.split('@')[0];
      
      return {
        id: email.id || email.message_id || Date.now().toString(),
        threadId: email.thread_id || email.threadId || email.id || "",
        from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
        subject: email.subject || "(No Subject)",
        snippet: email.body_plain?.substring(0, 150) || email.snippet || "",
        date: email.date || new Date().toISOString(),
        unread: email.labels?.includes('UNREAD') || false,
        body: email.body_plain || email.body || email.snippet || "",
      };
    });
  } catch (error) {
    console.error("❌ Failed to parse email response:", error);
    return [];
  }
}