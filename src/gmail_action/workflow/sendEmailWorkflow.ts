import { createWorkflowChain } from "@voltagent/core";
import { z } from "zod";
import { sendGmail } from "../index";

export const sendEmailWorkflow = createWorkflowChain({
  id: "send-email-workflow",
  name: "Send Email Workflow",

  input: z.object({
    to: z.string().email(),
    subject: z.string(),
    body: z.string(),
  }),

  result: z.object({
    ok: z.boolean(),
  }),
})

.andThen({
  id: "send-email",
  execute: async ({ data }) => {
    const res = (await sendGmail.execute!(data)) as { ok: boolean };
    return { ok: res.ok };
  },
});
