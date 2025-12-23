import { createTool } from "@voltagent/core";
import { z } from "zod";

export const ocrTool = createTool({
  name: "ocrScreenshot",
  description: "Extract visible text from base64 screenshot",

  parameters: z.object({
    imageBase64: z.string(),
  }),

  execute: async ({ imageBase64 }) => {
    console.log(" OCR running...");

    return {
      text: "Detected error: 500 Internal Server Error",
      success: true,
    };
  },
});
