import { createInputGuardrail, createOutputGuardrail } from "@voltagent/core";
import { getBannedWords } from "./bannedWords.js"; // Add .js extension

export const inputGuardrail = createInputGuardrail({
  name: "DynamicInputGuardrail",
  handler: async ({ input, agent }: any) => {
    let text = "";

    try {
      if (typeof input === "string") {
        text = input;
      } else if (Array.isArray(input)) {
        const user = input.find((m: any) => m?.role === "user");
        const part = user?.content?.find((c: any) => c?.type === "text");
        text = part?.text || "";
      } else if (typeof input === "object" && input.text) {
        text = input.text;
      }
    } catch {
      text = "";
    }

    const lower = text.toLowerCase();

    // Load banned words from database (returns string[])
    const banned = await getBannedWords();

    const found = banned.some((w: string) => {
      // Check exact match in nested structure if exists
      if (input?.[0]?.parts?.[0]?.text?.includes(w)) {
        console.log("found exact:", w);
        return true;
      }

      return lower.includes(w);
    });

    if (found) {
      return {
        pass: false,
        message: "❌ Dangerous request blocked by guardrail.",
      };
    }

    return { pass: true };
  },
});

export const outputGuardrail = createOutputGuardrail({
  name: "DynamicOutputGuardrail",
  handler: async ({ output, input }: any) => {
    // Extract text from different output shapes
    const out =
      typeof output === "string"
        ? output
        : output?.messages?.[0]?.content ?? output?.text ?? "";

    let safe = out;

    // Check if the model refused to handle PII
    const refusalPhrases = [
      "can't share or repeat personal",
      "can't provide personal",
      "cannot share sensitive",
      "keep this kind of sensitive data private",
    ];

    const isRefusal = refusalPhrases.some((phrase) =>
      out.toLowerCase().includes(phrase.toLowerCase())
    );

    // If model refused but input contains PII, create a helpful response
    if (isRefusal && typeof input === "string") {
      const hasEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(input);
      const hasPhone = /\b\d{6,14}\b/.test(input);

      if (hasEmail || hasPhone) {
        safe = "I've received your information. ";
        if (hasEmail) safe += "Your email has been noted. ";
        if (hasPhone) safe += "Your phone number has been recorded. ";
        safe += "How else can I assist you today?";
      }
    }

    // Mask phone-like numbers
    safe = safe.replace(/\b\d{6,14}\b/g, "[number-********]");

    // Mask emails
    safe = safe.replace(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      "[email-********]"
    );

    return {
      pass: true,
      action: "modify",
      modifiedOutput: safe,
      message: "Sensitive information removed",
    };
  },
});