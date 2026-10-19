import { randomBytes } from "node:crypto";

import type { OrderAction } from "@/schema/tool";

const REFERENCE_PREFIX: Record<OrderAction, string> = { cancel: "CXL", return: "RET", damage_replacement: "RPL" };

const references = new Map<string, string>();

export function recordRequest(orderId: string, action: OrderAction): string {
  const key = `${orderId}:${action}`;
  const existing = references.get(key);
  if (existing) return existing;
  const referenceId = `${REFERENCE_PREFIX[action]}-${randomBytes(2).toString("hex").toUpperCase()}`;
  references.set(key, referenceId);
  return referenceId;
}
