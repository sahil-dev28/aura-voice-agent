import { z } from "zod";

export const tokenRequestSchema = z
  .object({ resume_handle: z.string({ error: "resume_handle must be a string" }).min(1).max(4096).optional() })
  .default({});

export type TokenRequestInput = z.infer<typeof tokenRequestSchema>;
