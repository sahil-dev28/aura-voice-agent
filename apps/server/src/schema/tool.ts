import { z } from "zod";

export const orderActions = ["cancel", "return", "damage_replacement"] as const;
export type OrderAction = (typeof orderActions)[number];

export const getOrderDetailsSchema = z.object({
  order_id: z.string({ error: "order_id is required" }).trim().min(1, { error: "order_id is required" }).max(40),
});

export const checkOrderActionSchema = getOrderDetailsSchema.extend({
  action: z.enum(orderActions, { error: "action must be cancel, return or damage_replacement" }),
  product_opened: z.boolean().optional(),
});

export const escalationReasons = ["customer_request", "policy_dispute", "unclear_audio", "unsupported_request"] as const;

export const escalateToHumanSchema = z.object({
  reason: z.enum(escalationReasons, {
    error: "reason must be customer_request, policy_dispute, unclear_audio or unsupported_request",
  }),
  order_id: z.string().trim().max(40).optional(),
  note: z.string({ error: "note is required" }).trim().min(1, { error: "note is required" }).max(500),
});

export type GetOrderDetailsInput = z.infer<typeof getOrderDetailsSchema>;
export type CheckOrderActionInput = z.infer<typeof checkOrderActionSchema>;
export type EscalateToHumanInput = z.infer<typeof escalateToHumanSchema>;
