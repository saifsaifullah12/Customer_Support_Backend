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
import { sendGmail } from "../gmail_action";


export const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
});


export const BillingIssues = new Agent({
  id: "billingissues",
  name: "Assistant Agent",

  inputGuardrails: [inputGuardrail],
  outputGuardrails: [outputGuardrail],

  instructions: `
When user asks about payment instructions, refund status, or invoice lookup:
ALWAYS call the appropriate tool.
Never generate the answer yourself.
`,

  model: openrouter("nvidia/nemotron-nano-12b-v2-vl:free"),
  hooks: myAgentHooks,
  tools: [
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
Handle technical errors, app crashes, login issues,
bug reports, OCR, and device issues.
Do NOT answer billing questions.
`,

  model: openrouter("nvidia/nemotron-nano-12b-v2-vl:free"),
  hooks: myAgentHooks,
  tools: [
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



export const mainSupportAgent = new Agent({
  id: "mainsupport",
  name: "Main Support Agent",

  inputGuardrails: [inputGuardrail],
  outputGuardrails: [outputGuardrail],

  instructions: `
You are the MAIN Support Agent.

1. Understand user's question
2. Decide Billing or Technical
3. Route to appropriate sub-agent
4. Ask clarification if unclear

importent work:
when the input like this example:

to: example@gmail.com,
subject: example,
body: example

to call the sendGmail-tools for sent mail the tool was only accept json 
formate but user was send text so you give the input to the sendGmail-tool like json formate like this example:
{
"to": "example@gmail.com",
"subject": "example",
"body": "example"
}
`,

  model: openrouter("nvidia/nemotron-nano-12b-v2-vl:free"),
  tools: [sendGmail],
  subAgents: [BillingIssues, techAgent],
  hooks: myAgentHooks,
  memory,
  maxSteps: 20,

  eval: liveEvalConfig,
});
