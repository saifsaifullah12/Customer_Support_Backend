import { buildScorer } from "@voltagent/core";
import { createModerationScorer } from "@voltagent/scorers";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";


export const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
});


export const moderationScorer = createModerationScorer({
  model: openrouter("meta-llama/llama-3.3-70b-instruct:free"),
  threshold: 0.5,
});


export const responseLengthScorer = buildScorer({
  id: "response-length",
  label: "Response Length Check",
})
  .score(({ payload }) => {
    const output = String(payload.output || "");
    const length = output.length;

    return {
      score: length >= 50 ? 1 : 0,
      metadata: { length },
    };
  })
  .reason(({ score }) => ({
    reason:
      score === 1
        ? "Response length is sufficient"
        : "Response too short",
  }))
  .build();


export const billingKeywordScorer = buildScorer({
  id: "billing-keyword",
  label: "Billing Keyword Match",
})
  .score(({ payload }) => {
    const output = String(payload.output || "").toLowerCase();

    const matched =
      output.includes("refund") ||
      output.includes("invoice") ||
      output.includes("payment");

    return {
      score: matched ? 1 : 0,
      metadata: { matched },
    };
  })
  .reason(({ score }) => ({
    reason:
      score === 1
        ? "Billing keywords found"
        : "Billing keywords missing",
  }))
  .build();
