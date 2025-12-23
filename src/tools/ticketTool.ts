import { createTool } from "@voltagent/core";
import { z } from "zod";

export const ticketTool = createTool({
  name: "createTicket",
  description: "Create a support ticket for the user",

  parameters: z.object({
    issue: z.string(),
    priority: z.string().optional(),
  }),

  execute: async ({ issue, priority }) => {
    console.log("📨 Creating Ticket:");
    console.log("Issue:", issue);
    console.log("Priority:", priority ?? "Medium");

    const ticketId = "TCK-" + Math.floor(Math.random() * 90000 + 10000);

    return {
      ticketId,
      issue,
      priority: priority ?? "Medium",
      message: "Ticket created successfully!",
    };
  },
});
