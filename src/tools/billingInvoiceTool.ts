import { createTool } from "@voltagent/core";
import { z } from "zod";

export const billingInvoiceTool = createTool({
  name: "invoiceLookup",
  description: "Fetch invoice information",
  parameters: z.object({
    invoiceId: z.string(),
  }),
  execute: async ({ invoiceId }) => {
    return {
      invoiceId: invoiceId,
      amount: "₹499",
      status: "Pending",
      dueDate: "2025-01-20"
    };
  }
});
