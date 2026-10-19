import { randomBytes } from "node:crypto";

import type { OrderAction } from "@/schema/tool";

const REFERENCE_PREFIX: Record<OrderAction, string> = { cancel: "CXL", return: "RET", damage_replacement: "RPL" };

const references = new Map<string, string>();

const newId = (prefix: string) => `${prefix}-${randomBytes(2).toString("hex").toUpperCase()}`;

export function recordRequest(orderId: string, action: OrderAction): string {
  const key = `${orderId}:${action}`;
  const existing = references.get(key);
  if (existing) return existing;
  const referenceId = newId(REFERENCE_PREFIX[action]);
  references.set(key, referenceId);
  return referenceId;
}

export const openTicket = (): string => newId("ESC");
