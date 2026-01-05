// import { createTool } from "@voltagent/core";
// import { z } from "zod";
// import { getZapierClient } from "./mcpconnection";

// export const zapierSendEmailTool: any = createTool({
//   id: "gmail_send_email",
//   name: "gmail_send_email",
//   description: "Send a NEW email via Gmail through Zapier MCP",

//   parameters: z.object({
//     to: z.array(z.string().email()).describe("Array of recipient email addresses"),
//     subject: z.string().describe("Email subject line"),
//     body: z.string().describe("Email body content"),
//   }),

//   execute: async ({ to, subject, body }) => {
//     try {
//       console.log("📧 Sending email via Zapier MCP:", { to, subject });
      
//       const client = await getZapierClient();

//       // Create the instructions string
//       const instructions = `Send an email to ${to.join(", ")} with subject "${subject}" and body: ${body}`;

//       // Call the tool with the correct parameter structure
//       const result = await client.callTool({
//         name: "gmail_send_email",
//         arguments: {
//           instructions: instructions,
//           // Note: We pass instructions as the primary parameter
//           // Zapier will parse the rest from the instructions
//         },
//       });

//       console.log("✅ Email sent successfully:", result);

//       return {
//         success: true,
//         message: `Email sent successfully to ${to.join(", ")}`,
//         result: result.content || result,
//       };
//     } catch (error: any) {
//       console.error("❌ Failed to send email:", error);
//       return {
//         success: false,
//         error: error.message || "Failed to send email",
//         details: error.toString(),
//       };
//     }
//   },
// });