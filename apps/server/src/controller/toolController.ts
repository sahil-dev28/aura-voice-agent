import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";

import { type Order, getOrder, listOrders } from "@/data/orders";
import type { CheckOrderActionInput, GetOrderDetailsInput, OrderAction } from "@/schema/tool";
import { formatUnknownError } from "@/utils/formatUnknownError";
import { normalizeOrderId } from "@/utils/orderId";
import {
  type Decision,
  canCancel,
  canReplaceDamaged,
  canReturn,
  daysSince,
  isCodEligible,
  shippingFee,
} from "@/utils/orderPolicy";

type NotFound = { found: false; reason: "INVALID_FORMAT" | "NOT_FOUND"; heard: string };

const REFERENCE_PREFIX: Record<OrderAction, string> = { cancel: "CXL", return: "RET", damage_replacement: "RPL" };

function findOrder(raw: string, now: Date): Order | NotFound {
  const normalized = normalizeOrderId(raw);
  if (!normalized.ok) return { found: false, reason: "INVALID_FORMAT", heard: raw };
  return getOrder(normalized.orderId, now) ?? { found: false, reason: "NOT_FOUND", heard: raw };
}

function toOrderView(order: Order, now: Date) {
  return {
    ...order,
    shippingFeeInr: shippingFee(order.valueInr),
    codEligible: isCodEligible(order.valueInr),
    deliveredDaysAgo: order.deliveredAt ? daysSince(order.deliveredAt, now) : undefined,
  };
}

function decide(order: Order, input: CheckOrderActionInput, now: Date): Decision {
  switch (input.action) {
    case "cancel":
      return canCancel(order);
    case "return":
      return canReturn(order, { productOpened: input.product_opened }, now);
    case "damage_replacement":
      return canReplaceDamaged(order, now);
  }
}

export const getOrders = async (_req: Request, res: Response): Promise<void> => {
  try {
    const now = new Date();
    res.status(200).json({ data: listOrders(now).map((order) => toOrderView(order, now)) });
    return;
  } catch (error) {
    res.status(500).json(formatUnknownError(error));
  }
};

export const getOrderDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    const { order_id } = req.body as GetOrderDetailsInput;
    const now = new Date();
    const order = findOrder(order_id, now);
    if ("found" in order) {
      res.status(200).json({ data: order });
      return;
    }
    res.status(200).json({ data: { found: true, order: toOrderView(order, now), cancel: canCancel(order) } });
    return;
  } catch (error) {
    res.status(500).json(formatUnknownError(error));
  }
};

export const checkOrderAction = async (req: Request, res: Response): Promise<void> => {
  try {
    const input = req.body as CheckOrderActionInput;
    const now = new Date();
    const order = findOrder(input.order_id, now);
    if ("found" in order) {
      res.status(200).json({ data: order });
      return;
    }
    const decision = decide(order, input, now);
    const referenceId = decision.eligible
      ? `${REFERENCE_PREFIX[input.action]}-${randomBytes(2).toString("hex").toUpperCase()}`
      : undefined;
    res.status(200).json({ data: { found: true, orderId: order.orderId, action: input.action, ...decision, referenceId } });
    return;
  } catch (error) {
    res.status(500).json(formatUnknownError(error));
  }
};

export const unknownTool = async (_req: Request, res: Response): Promise<void> => {
  res.status(404).json({ error: "Unknown tool" });
  return;
};
