import { createTool } from "@voltagent/core";
import { z } from "zod";

const KB_DATA = [
  {
    title: "Login Issue",
    keywords: ["login", "signin", "auth"],
    answer: "Try resetting your password or clearing your browser cache.",
  },
  {
    title: "Payment Failed",
    keywords: ["payment", "checkout", "card"],
    answer: "Please verify card details or contact your bank.",
  },
  { 
    title: "App Crash",
    keywords: ["crash", "error", "freeze"],
    answer: "Update the app to the latest version and restart.",
  },
];

export const kbSearchTool = createTool({
  name: "searchKnowledgebase",
  description: "Search for solutions in the knowledgebase",

  parameters: z.object({
    query: z.string(),
  }),

  execute: async ({ query }) => {
    console.log("🔍 Searching KB for:", query);

    const lower = query.toLowerCase();

    const match =
      KB_DATA.find((item) =>
        item.keywords.some((k) => lower.includes(k))
      ) ?? null;

    if (!match) {
      return {
        match: false,
        answer: "No matching KB entry found.",
      };
    }

    return {
      match: true,
      title: match.title,
      answer: match.answer,
    };
  },
});
