import { createTool, VoltOpsClient } from "@voltagent/core";
import { z } from "zod";

const voltops = new VoltOpsClient({
  publicKey: process.env.VOLTAGENT_PUBLIC_KEY!,
  secretKey: process.env.VOLTAGENT_SECRET_KEY!,
});

export const sendGmail = createTool({
  id: "send_gmail",
  name: "send_gmail",
  description: "Send Gmail via VoltOps",

  parameters: z.object({
    to: z.string().email(),
    subject: z.string(),
    body: z.string(),
  }),

  execute: async ({ to, subject, body }) => {
    const gmail = (voltops.actions as any).gmail;

    if (!gmail) {
      throw new Error("Gmail action not available");
    }

    const response = await gmail.sendEmail({
      credential: {
        credentialId: process.env.GMAIL_CREDENTIAL_ID!,
      },
      to,
      subject,
      textBody: body,
    });

    return { ok: !!response };
  },
});
