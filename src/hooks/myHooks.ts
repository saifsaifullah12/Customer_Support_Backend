import { createHooks } from "@voltagent/core";

export const myAgentHooks = createHooks({
  onStart: async ({ agent }) => {
    console.log("🚀 Agent started:", agent?.name);
  },

  
  onToolStart: async ({ agent, tool, args }) => {
    console.log("🔧[beforeToolCall] Tool Started");
    console.log("Agent:", agent?.name);
    console.log("Tool:", tool?.name);
    console.log("Arguments:", args); 
  },

  onEnd: async ({ agent, output, error, context }) => {
    console.log("💬 [afterAgentResponse] Agent finished");

    if (error) {
      console.error("Error:", error?.message ?? error);
      return;
    }

    console.log("Agent:", agent?.name);
    try {
      console.log("Assistant Output:", output);
    } catch {
      console.log("Assistant Output: <unreadable>");
    }
    console.log("📥 Conversation context (read-only):", context);
  },
});
