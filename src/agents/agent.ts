// // src/agents/emailAgent.ts
// import { Agent } from "@voltagent/core";
// import { sendGmail } from "../gmail_action";
// import { createOpenRouter } from "@openrouter/ai-sdk-provider";

// export const openrouter = createOpenRouter({
//   apiKey: process.env.OPENROUTER_API_KEY!,
// });

// export const emailAgent: any = new Agent({
//   id: "email-agent",
//   name: "Email Agent",
//   instructions: `Send email using Gmail action tool send_gmail  
  
//   `,
//     model: openrouter("nvidia/nemotron-nano-12b-v2-vl:free"),
//   tools: [sendGmail],
// });
