import { describe, expect, it } from "vitest";

import { normalizeOrderId } from "@/utils/orderId";

describe("normalizeOrderId", () => {
  it.each([
    ["ORD-101", "ORD-101"],
    ["ord 101", "ORD-101"],
    ["ORD101", "ORD-101"],
    ["101", "ORD-101"],
    ["order number 102", "ORD-102"],
    ["order one oh one", "ORD-101"],
    ["one zero three", "ORD-103"],
    ["O R D 1 0 2", "ORD-102"],
    ["one double zero", "ORD-100"],
    ["one hundred and one", "ORD-101"],
    ["one hundred three", "ORD-103"],
    ["ORD-109", "ORD-109"],
  ])("%s -> %s", (raw, expected) => {
    expect(normalizeOrderId(raw)).toEqual({ ok: true, orderId: expected });
  });

  it.each(["", "ORD-", "hello", "12a", "12", "my order", "ord 1234567"])("rejects %j", (raw) => {
    expect(normalizeOrderId(raw)).toEqual({ ok: false });
  });
});
