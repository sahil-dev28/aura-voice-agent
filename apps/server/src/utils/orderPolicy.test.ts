import { describe, expect, it } from "vitest";

import { DAY_MS, HOUR_MS, type Order, getOrder } from "@/data/orders";
import { canCancel, canReplaceDamaged, canReturn, daysSince, isCodEligible, shippingFee } from "@/utils/orderPolicy";

const now = new Date("2026-10-18T05:00:00Z");
const delivered = (msAgo: number): Order => ({
  orderId: "ORD-900",
  customerName: "Test",
  phone: "+91 90000 00000",
  product: "Serum",
  valueInr: 699,
  status: "DELIVERED",
  orderedAt: new Date(now.getTime() - msAgo - 3 * DAY_MS),
  deliveredAt: new Date(now.getTime() - msAgo),
});
const order = (id: string) => getOrder(id, now) as Order;

describe("shipping and COD", () => {
  it.each([
    [498, 50],
    [499, 0],
    [699, 0],
  ])("value %i -> fee %i", (value, fee) => {
    expect(shippingFee(value)).toBe(fee);
  });

  it("COD up to 2500 only", () => {
    expect(isCodEligible(2500)).toBe(true);
    expect(isCodEligible(2501)).toBe(false);
  });
});

describe("daysSince", () => {
  it("floors partial days", () => {
    expect(daysSince(new Date(now.getTime() - 14.7 * DAY_MS), now)).toBe(14);
  });
});

describe("canCancel", () => {
  it("allows PROCESSING (ORD-103)", () => {
    expect(canCancel(order("ORD-103"))).toMatchObject({ eligible: true, reasonCode: "CANCELLABLE" });
  });

  it("refuses OUT_FOR_DELIVERY (ORD-101) and suggests refusing at doorstep", () => {
    const decision = canCancel(order("ORD-101"));
    expect(decision).toMatchObject({ eligible: false, reasonCode: "NOT_CANCELLABLE_IN_TRANSIT" });
    expect(decision.nextStep).toMatch(/refuse/i);
  });

  it("refuses SHIPPED", () => {
    expect(canCancel({ ...order("ORD-101"), status: "SHIPPED" }).reasonCode).toBe("NOT_CANCELLABLE_IN_TRANSIT");
  });

  it("refuses DELIVERED (ORD-102)", () => {
    expect(canCancel(order("ORD-102"))).toMatchObject({ eligible: false, reasonCode: "ALREADY_DELIVERED" });
  });
});

describe("canReturn", () => {
  it("refuses 20 days + opened because the window expired", () => {
    expect(canReturn(delivered(20 * DAY_MS), { productOpened: true }, now)).toMatchObject({
      eligible: false,
      reasonCode: "RETURN_WINDOW_EXPIRED",
    });
  });

  it("allows 5 days + unopened", () => {
    expect(canReturn(delivered(5 * DAY_MS), { productOpened: false }, now)).toMatchObject({
      eligible: true,
      reasonCode: "RETURNABLE",
    });
  });

  it("refuses 5 days + opened", () => {
    expect(canReturn(delivered(5 * DAY_MS), { productOpened: true }, now).reasonCode).toBe("PRODUCT_OPENED");
  });

  it("asks whether it is opened when unknown", () => {
    expect(canReturn(delivered(5 * DAY_MS), {}, now)).toMatchObject({ eligible: false, reasonCode: "NEEDS_INFO" });
  });

  it("allows exactly 7 days", () => {
    expect(canReturn(delivered(7 * DAY_MS), { productOpened: false }, now).eligible).toBe(true);
  });

  it("refuses ORD-102 at 14 days", () => {
    expect(canReturn(order("ORD-102"), { productOpened: false }, now).reasonCode).toBe("RETURN_WINDOW_EXPIRED");
  });

  it("refuses orders not yet delivered (ORD-101)", () => {
    expect(canReturn(order("ORD-101"), { productOpened: false }, now).reasonCode).toBe("NOT_YET_DELIVERED");
  });
});

describe("canReplaceDamaged", () => {
  it("allows at 47 hours and asks for photos", () => {
    const decision = canReplaceDamaged(delivered(47 * HOUR_MS), now);
    expect(decision).toMatchObject({ eligible: true, reasonCode: "REPLACEMENT_ELIGIBLE" });
    expect(decision.nextStep).toMatch(/photo/i);
  });

  it("refuses at 49 hours", () => {
    expect(canReplaceDamaged(delivered(49 * HOUR_MS), now).reasonCode).toBe("DAMAGE_REPORT_WINDOW_EXPIRED");
  });

  it("refuses undelivered orders", () => {
    expect(canReplaceDamaged(order("ORD-103"), now).reasonCode).toBe("NOT_YET_DELIVERED");
  });
});

describe("decision copy", () => {
  it("never promises refund timelines", () => {
    const decisions = [
      canReturn(delivered(5 * DAY_MS), { productOpened: false }, now),
      canCancel(order("ORD-103")),
      canReplaceDamaged(delivered(5 * HOUR_MS), now),
    ];
    for (const d of decisions) {
      expect(`${d.explanation} ${d.nextStep}`).not.toMatch(/\d+\s*(business\s*)?days?\s*(for|to)\s*(refund|credit)/i);
    }
  });
});
