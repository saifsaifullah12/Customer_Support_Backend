import type { Context } from "hono";
import { readInboxTool } from "../mcp/readInboxTool";

export async function getInboxRoute(c: Context) {
  try {
    // Get Auth0 token from request headers or query
    const token = c.req.header('Authorization')?.replace('Bearer ', '') || 
                  c.req.query('token') || 
                  process.env.Access_Token?.replace(/^["']|["']$/g, "").trim();

    if (!token) {
      return c.json({
        ok: false,
        error: "Auth0 token is required. Please provide token in Authorization header or query parameter.",
      }, 401);
    }

    // Get maxEmails from query parameter (default: 50)
    const maxEmails = parseInt(c.req.query('maxEmails') || '50');

    console.log(`📬 Fetching last ${maxEmails} emails via Mail MCP`);

    const result: any = await readInboxTool.execute({
      token,
      maxEmails,
    });

    if (result.success) {
      // Parse the formatted inbox response
      const emails = parseMailMCPResponse(result.result);

      console.log("✅ Parsed emails:", emails.length);

      return c.json({
        ok: true,
        emails: emails,
        count: result.emailCount || emails.length,
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

// Helper function to parse Mail MCP response
function parseMailMCPResponse(response: string): Array<{
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
    console.log("🔍 Parsing Mail MCP response");
    console.log("📝 Response length:", response.length);
    
    const emails: any[] = [];
    
    // Split by numbered entries (e.g., "1. 📧", "2. 📧", etc.)
    const lines = response.split('\n');
    let currentEmail: any = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Check if this is the start of a new email entry
      if (/^\d+\.\s*📧/.test(line)) {
        // Save previous email if exists
        if (currentEmail && currentEmail.from && currentEmail.subject) {
          emails.push(currentEmail);
        }
        
        // Start new email
        currentEmail = {
          id: `email-${Date.now()}-${Math.random()}`,
          threadId: `thread-${Date.now()}-${Math.random()}`,
          from: '',
          subject: '',
          snippet: '',
          date: new Date().toISOString(),
          unread: false,
          body: '',
        };
        
        // Extract "From:" from the same line if present
        const fromMatch = line.match(/From:\s*(.+)/i);
        if (fromMatch) {
          currentEmail.from = fromMatch[1].trim();
        }
      }
      // Extract fields for current email
      else if (currentEmail) {
        if (line.startsWith('From:')) {
          currentEmail.from = line.replace(/^From:\s*/i, '').trim();
        }
        else if (line.startsWith('Subject:')) {
          currentEmail.subject = line.replace(/^Subject:\s*/i, '').trim();
        }
        else if (line.startsWith('Date:')) {
          const dateStr = line.replace(/^Date:\s*/i, '').trim();
          currentEmail.date = dateStr;
        }
        else if (line.startsWith('Preview:')) {
          const preview = line.replace(/^Preview:\s*/i, '').trim();
          currentEmail.snippet = preview.replace(/\.\.\.$/, '');
          currentEmail.body = currentEmail.snippet;
        }
      }
    }
    
    // Don't forget to add the last email
    if (currentEmail && currentEmail.from && currentEmail.subject) {
      emails.push(currentEmail);
    }
    
    console.log("📧 Parsed email count:", emails.length);
    
    if (emails.length > 0) {
      console.log("📧 Sample email:", JSON.stringify(emails[0], null, 2));
    } else {
      console.log("⚠️ No emails were parsed. Check response format:");
      console.log("First 500 chars:", response.substring(0, 500));
    }
    
    return emails;
    
  } catch (error) {
    console.error("❌ Failed to parse email response:", error);
    console.error("Response:", response.substring(0, 1000));
    return [];
  }
}