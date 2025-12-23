import { createTool } from "@voltagent/core";
import { z } from "zod";

const BILLING_KB = [
  {
    title: "How to Pay Invoice",
    keywords: ["pay", "payment", "invoice", "checkout"],
    answer: "You can pay your invoice from Billing → Payments using card or UPI.",
  },
  {
    title: "Refund Status",
    keywords: ["refund", "money back"],
    answer: "Refunds take 5–7 business days depending on your bank.",
  },
  {
    title: "Subscription Renewal",
    keywords: ["subscription", "renew", "plan"],
    answer: "Subscriptions renew automatically unless cancelled from Billing settings.",
  },
];

export const billingKbTool = createTool({
  name: "billingKnowledgeSearch",
  description: "Search billing-related knowledgebase answers",

  parameters: z.object({
    query: z.string(),
  }),

  execute: async ({ query }) => {
    console.log("🔍 Billing KB Search:", query);

    const lower = query.toLowerCase();

    const match =
      BILLING_KB.find((item) =>
        item.keywords.some((k) => lower.includes(k))
      ) ?? null;

    if (!match) {
      return {
        match: false,
        answer: "No billing information found for your query.",
      };
    }

    return {
      match: true,
      title: match.title,
      answer: match.answer,
    };
  },
});
