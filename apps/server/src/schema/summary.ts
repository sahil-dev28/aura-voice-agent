import { z } from "zod";

export const customerIntents = [
  "ORDER_TRACKING",
  "CANCELLATION",
  "RETURN_REFUND",
  "DAMAGED_PRODUCT",
  "SHIPPING_INFO",
  "PAYMENT_COD",
  "PRODUCT_QUERY",
  "OUT_OF_SCOPE",
  "OTHER",
] as const;

export const resolutionStatuses = ["RESOLVED", "UNRESOLVED", "POLICY_DECLINED", "ESCALATION_NEEDED"] as const;

export const sentiments = ["POSITIVE", "NEUTRAL", "NEGATIVE"] as const;

export const transcriptEntrySchema = z.object({
  role: z.enum(["customer", "agent", "tool"]),
  text: z.string().max(4000),
  ts: z.number(),
});

export const summaryRequestSchema = z.object({
  transcript: z.array(transcriptEntrySchema).min(1, { error: "Transcript is empty" }).max(400),
  toolEvents: z.array(z.object({ name: z.string(), args: z.unknown(), result: z.unknown() })).max(50).default([]),
});

export const callOutcomeSchema = z.object({
  customer_intent: z.enum(customerIntents),
  order_id: z.string().nullable(),
  resolution_status: z.enum(resolutionStatuses),
  sentiment: z.enum(sentiments),
  policy_flags: z.array(z.string()),
  call_summary: z.string().min(1),
  follow_up_required: z.boolean(),
});

export type SummaryRequestInput = z.infer<typeof summaryRequestSchema>;
export type CallOutcome = z.infer<typeof callOutcomeSchema>;
