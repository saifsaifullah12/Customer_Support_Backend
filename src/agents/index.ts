import { Agent } from "@voltagent/core";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { myAgentHooks } from "../hooks/myHooks";
import { kbSearchTool } from "../tools/kbSearchTool";
import { ticketTool } from "../tools/ticketTool";
import { ocrTool } from "../tools/ocrTool";
import { billingKbTool } from "../tools/billingTool";
import { billingInvoiceTool } from "../tools/billingInvoiceTool";
import { billingRefundTool } from "../tools/billingRefundTool";
import { memory } from "../memory/index.js";
import { inputGuardrail, outputGuardrail } from "../guardrails/security.js";
import { liveEvalConfig } from "../evals/liveEvalConfig";
import { readInboxTool } from "../mcp/readInboxTool";
import { sendMailTool } from "../mcp/sendMailTool";
// import { zapierSendEmailTool } from "../mcp/zapierSendEmailTool";
// import { zapierReplyEmailTool } from "../mcp/zapierReplyEmailTool";
// import { zapierFetchInboxTool } from "../mcp/zapierFetchInboxTool";
import { ragSearchTool } from "../rag/ragTool";

export const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
});

export const BillingIssues = new Agent({
  id: "billingissues",
  name: "Billing Agent",

  inputGuardrails: [inputGuardrail],
  outputGuardrails: [outputGuardrail],

  instructions: `
You are a Billing Support Agent specializing in payment-related queries.

When user asks about:
- Payment instructions
- Refund status
- Invoice lookup
- Billing history
- Payment methods

ALWAYS call the appropriate tool. Never generate answers yourself.
Provide clear, accurate information based on tool results.
`,

  model: openrouter("kwaipilot/kat-coder-pro:free"),
  hooks: myAgentHooks,
  tools: [
    ragSearchTool,
    kbSearchTool,
    billingRefundTool,
    billingInvoiceTool,
    billingKbTool,
    ticketTool,
    ocrTool,
  ],
  memory,
  maxSteps: 10,
});

export const techAgent = new Agent({
  id: "techsupport",
  name: "Tech Support Agent",

  inputGuardrails: [inputGuardrail],
  outputGuardrails: [outputGuardrail],

  instructions: `
You are a Technical Support Agent specializing in technical issues.

Handle:
- Technical errors and bugs
- App crashes and login issues
- Device compatibility problems
- Bug reports
- OCR and image processing issues

ALWAYS use tools for technical diagnostics.
Do NOT answer billing questions - those should be routed elsewhere.
`,

  model: openrouter("kwaipilot/kat-coder-pro:free"),
  hooks: myAgentHooks,
  tools: [
    ragSearchTool,
    kbSearchTool,
    ticketTool,
    ocrTool,
  ],
  memory,
  maxSteps: 10,
});

export const mailAgent = new Agent({
  id: "mailagent",
  name: "Email Agent",

  inputGuardrails: [inputGuardrail],
  outputGuardrails: [outputGuardrail],

  instructions: `
You are an Email Agent that manages emails through a custom MCP server.

Your capabilities:

1. READ INBOX:
   - Use read_inbox tool to fetch emails from Gmail
   - Requires Auth0 JWT token for authentication
   - Returns formatted list of recent emails with sender, subject, date, and preview

2. SEND EMAILS:
   - Use send_mail tool to send new emails
   - Parameters: to (email address), subject (string), body (string)
   - Sends via Gmail SMTP

CRITICAL RULES FOR SENDING EMAILS:
- Write COMPLETE professional email content (not placeholders)
- Structure: Greeting → Acknowledgment → Main content → Closing
- Be helpful, professional, and empathetic
- Example good email body:
  "Hi [Name],
  
  Thank you for reaching out about [issue]. I understand your concern and I'm here to help.
  
  [Main helpful content addressing their issue]
  
  Please let me know if you need any further assistance.
  
  Best regards,
  Support Team"

- BAD example (never do this): "Email sent successfully" or "Reply sent"

WORKFLOW:
1. When asked to send an email:
   - Generate professional email content
   - Call send_mail with to, subject, and body
   - After success, respond to user with ONLY: "✅ Email sent successfully to [recipient]"

2. When asked to read inbox:
   - User must provide their Auth0 token
   - Call read_inbox with the token
   - Display the formatted results to user

Execute immediately without asking for confirmation.
Keep final responses SHORT - just success confirmations.
`,

  model: openrouter("kwaipilot/kat-coder-pro:free"),
  tools: [
    ragSearchTool,
    readInboxTool,
    sendMailTool
  ],
  hooks: myAgentHooks,
  memory,
  maxSteps: 5,
});

export const mainSupportAgent = new Agent({
  id: "mainsupport",
  name: "Main Support Agent",

  inputGuardrails: [inputGuardrail],
  outputGuardrails: [outputGuardrail],

  instructions: `
You are the MAIN Support Agent that routes requests to specialized agents.

Your job is to analyze the user's request and delegate to the appropriate agent:

=== ROUTING RULES ===

1. EMAIL REQUESTS → Route to "Email Agent"
   - Sending emails
   - Reading inbox (requires Auth0 token)
   - Pass ALL details to Email Agent without modification

2. BILLING REQUESTS → Route to "Billing Agent"
   - Payment questions, refunds, invoices, billing history

3. TECHNICAL REQUESTS → Route to "Tech Support Agent"
   - App crashes, bugs, login issues, technical errors

=== CRITICAL FOR EMAIL REQUESTS ===

When routing email requests to Email Agent:
- Pass the COMPLETE request details
- Do NOT try to generate email content yourself
- Let Email Agent handle email generation and sending
- Simply forward the task and wait for confirmation

=== RESPONSE FORMAT ===

When Email Agent returns a success confirmation:
- Return ONLY the success message to the user
- Example: "✅ Email sent successfully to recipient@email.com"
- Do NOT add any additional commentary
- Do NOT explain what happened

Remember: You are a router. Your job is to direct traffic and return clean responses.
`,

  model: openrouter("kwaipilot/kat-coder-pro:free"),
  subAgents: [BillingIssues, techAgent, mailAgent],
  tools: [ragSearchTool],
  hooks: myAgentHooks,
  memory, 
  maxSteps: 10,
  eval: liveEvalConfig,
});