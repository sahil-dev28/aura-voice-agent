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

export type GetOrderDetailsInput = z.infer<typeof getOrderDetailsSchema>;
export type CheckOrderActionInput = z.infer<typeof checkOrderActionSchema>;
