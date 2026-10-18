import { describe, expect, it } from "vitest";

import { DAY_MS, getOrder, istTimeToday, listOrders } from "@/data/orders";

describe("istTimeToday", () => {
  it("returns 18:00 IST on the same IST day", () => {
    const now = new Date("2026-10-18T05:00:00Z");
    expect(istTimeToday(now, 18).toISOString()).toBe("2026-10-18T12:30:00.000Z");
  });

  it("rolls to the next IST date late in the UTC evening", () => {
    const now = new Date("2026-10-18T19:00:00Z");
    expect(istTimeToday(now, 18).toISOString()).toBe("2026-10-19T12:30:00.000Z");
  });
});

describe("orders", () => {
  const now = new Date("2026-10-18T05:00:00Z");

  it("has the three brief orders", () => {
    expect(listOrders(now).map((o) => o.orderId)).toEqual(["ORD-101", "ORD-102", "ORD-103"]);
  });

  it("ORD-101 is out for delivery, expected 6 PM IST today", () => {
    const order = getOrder("ORD-101", now);
    expect(order?.status).toBe("OUT_FOR_DELIVERY");
    expect(order?.trackingId).toBe("BD-982103");
    expect(order?.expectedBy?.toISOString()).toBe("2026-10-18T12:30:00.000Z");
  });

  it("ORD-102 was delivered 14 days ago", () => {
    const order = getOrder("ORD-102", now);
    expect(order?.status).toBe("DELIVERED");
    expect(now.getTime() - (order?.deliveredAt?.getTime() ?? 0)).toBe(14 * DAY_MS);
  });

  it("ORD-103 is processing and was ordered 3 hours ago", () => {
    const order = getOrder("ORD-103", now);
    expect(order?.status).toBe("PROCESSING");
    expect(order?.valueInr).toBe(850);
  });

  it("returns undefined for unknown ids", () => {
    expect(getOrder("ORD-109", now)).toBeUndefined();
  });
});
