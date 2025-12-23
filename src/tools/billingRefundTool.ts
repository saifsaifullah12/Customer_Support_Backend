import { createTool } from "@voltagent/core";
import { z } from "zod";

export const billingRefundTool = createTool({
  name: "billingRefund",
  description: "Check refund timeline",
  parameters: z.object({
    orderId: z.string().optional(),
  }),
  execute: async ({ orderId }) => {
    return {
      answer: orderId
        ? `Refund for Order ${orderId} is in progress. Expected 3–5 business days.`
        : "Refunds typically take 3–5 business days."
    };
  }
});
