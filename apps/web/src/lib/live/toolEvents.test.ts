import { describe, expect, it } from "vitest";

import { describeToolEvent, filterCancelled } from "@/lib/live/toolEvents";

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
        { found: true, orderId: "ORD-103", action: "cancel", eligible: true, reasonCode: "CANCELLABLE", referenceId: "CXL-1A2B" },
      ),
    ).toBe("Checked cancel for ORD-103: eligible, ref CXL-1A2B");
  });

  it("describes failures", () => {
    expect(describeToolEvent("get_order_details", { order_id: "ORD-101" }, { error: "LOOKUP_UNAVAILABLE" })).toBe(
      "get_order_details failed: LOOKUP_UNAVAILABLE",
    );
  });
});

describe("filterCancelled", () => {
  it("drops responses whose call id was cancelled", () => {
    const responses = [{ id: "a" }, { id: "b" }, {}];
    expect(filterCancelled(responses, new Set(["a"]))).toEqual([{ id: "b" }, {}]);
  });
});
