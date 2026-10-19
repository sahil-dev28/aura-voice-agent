import { describe, expect, it } from "vitest";

import { describeToolEvent, filterCancelled, findEscalation } from "@/lib/live/toolEvents";

describe("describeToolEvent", () => {
  it("describes a found order", () => {
    expect(
      describeToolEvent("get_order_details", { order_id: "ORD-101" }, { found: true, order: { orderId: "ORD-101", status: "OUT_FOR_DELIVERY" } }),
    ).toBe("Looked up ORD-101: out for delivery");
  });

  it("describes a missing order", () => {
    expect(describeToolEvent("get_order_details", { order_id: "ORD-109" }, { found: false, reason: "NOT_FOUND", heard: "ORD-109" })).toBe(
      'No order found for "ORD-109"',
    );
  });

  it("describes an action decision", () => {
    expect(
      describeToolEvent(
        "check_order_action",
        { order_id: "ORD-102", action: "return" },
        { found: true, orderId: "ORD-102", action: "return", eligible: false, reasonCode: "RETURN_WINDOW_EXPIRED" },
      ),
    ).toBe("Checked return for ORD-102: not eligible (RETURN_WINDOW_EXPIRED)");
    expect(
      describeToolEvent(
        "check_order_action",
        { order_id: "ORD-103", action: "cancel" },
        { found: true, orderId: "ORD-103", action: "cancel", eligible: true, reasonCode: "CANCELLABLE" },
      ),
    ).toBe("Checked cancel for ORD-103: eligible");
  });

  it("describes a confirmed action", () => {
    expect(
      describeToolEvent(
        "confirm_order_action",
        { order_id: "ORD-103", action: "cancel" },
        { found: true, orderId: "ORD-103", action: "cancel", eligible: true, confirmed: true, referenceId: "CXL-1A2B" },
      ),
    ).toBe("Recorded cancel for ORD-103: ref CXL-1A2B");
    expect(
      describeToolEvent(
        "confirm_order_action",
        { order_id: "ORD-101", action: "cancel" },
        { found: true, orderId: "ORD-101", action: "cancel", eligible: false, confirmed: false, reasonCode: "NOT_CANCELLABLE_IN_TRANSIT" },
      ),
    ).toBe("Could not record cancel for ORD-101: not eligible (NOT_CANCELLABLE_IN_TRANSIT)");
  });

  it("describes an escalation", () => {
    expect(
      describeToolEvent(
        "escalate_to_human",
        { reason: "policy_dispute", note: "x" },
        { escalated: true, ticketId: "ESC-4F2A", reason: "policy_dispute", orderId: "ORD-102" },
      ),
    ).toBe("Escalated to human: ESC-4F2A (policy dispute)");
  });

  it("describes failures", () => {
    expect(describeToolEvent("get_order_details", { order_id: "ORD-101" }, { error: "LOOKUP_UNAVAILABLE" })).toBe(
      "get_order_details failed: LOOKUP_UNAVAILABLE",
    );
  });
});

describe("findEscalation", () => {
  it("returns the first successful escalation result", () => {
    const ticket = { escalated: true, ticketId: "ESC-4F2A" };
    const events = [
      { name: "get_order_details", result: { found: true } },
      { name: "escalate_to_human", result: { error: "LOOKUP_UNAVAILABLE" } },
      { name: "escalate_to_human", result: ticket },
    ];
    expect(findEscalation(events)).toBe(ticket);
  });

  it("returns undefined when nothing was escalated", () => {
    expect(findEscalation([{ name: "get_order_details", result: { found: true } }])).toBeUndefined();
  });
});

describe("filterCancelled", () => {
  it("drops responses whose call id was cancelled", () => {
    const responses = [{ id: "a" }, { id: "b" }, {}];
    expect(filterCancelled(responses, new Set(["a"]))).toEqual([{ id: "b" }, {}]);
  });
});
