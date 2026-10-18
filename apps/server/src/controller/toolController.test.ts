import request from "supertest";
import { describe, expect, it } from "vitest";

import { app } from "@/app";

const lookup = (body: object) => request(app).post("/api/tools/get_order_details").send(body);
const action = (body: object) => request(app).post("/api/tools/check_order_action").send(body);

describe("GET /api/orders", () => {
  it("lists the three orders with derived fields", async () => {
    const res = await request(app).get("/api/orders");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data[1]).toMatchObject({ orderId: "ORD-102", shippingFeeInr: 0, codEligible: true, deliveredDaysAgo: 14 });
  });
});

describe("POST /api/tools/get_order_details", () => {
  it("finds ORD-101 from a spoken id", async () => {
    const res = await lookup({ order_id: "order one oh one" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      found: true,
      order: { orderId: "ORD-101", status: "OUT_FOR_DELIVERY", carrier: "BlueDart" },
      cancel: { eligible: false, reasonCode: "NOT_CANCELLABLE_IN_TRANSIT" },
    });
    expect(typeof res.body.data.order.expectedBy).toBe("string");
  });

  it("returns NOT_FOUND as data, not an HTTP error", async () => {
    const res = await lookup({ order_id: "ORD-109" });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ found: false, reason: "NOT_FOUND", heard: "ORD-109" });
  });

  it("returns INVALID_FORMAT for garbage", async () => {
    const res = await lookup({ order_id: "banana" });
    expect(res.body.data).toEqual({ found: false, reason: "INVALID_FORMAT", heard: "banana" });
  });

  it("rejects a missing order_id with 400", async () => {
    const res = await lookup({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("order_id is required");
    expect(res.body.fieldErrors).toHaveProperty("order_id");
  });

  it("ignores extra arguments from the model", async () => {
    const res = await lookup({ order_id: "ORD-103", note: "x" });
    expect(res.body.data.found).toBe(true);
  });
});

describe("POST /api/tools/check_order_action", () => {
  it("cancels ORD-103 with a CXL reference", async () => {
    const res = await action({ order_id: "ORD-103", action: "cancel" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ found: true, orderId: "ORD-103", action: "cancel", eligible: true });
    expect(res.body.data.referenceId).toMatch(/^CXL-[0-9A-F]{4}$/);
  });

  it("refuses ORD-102 return without a reference", async () => {
    const res = await action({ order_id: "ORD-102", action: "return", product_opened: false });
    expect(res.body.data).toMatchObject({ eligible: false, reasonCode: "RETURN_WINDOW_EXPIRED" });
    expect(res.body.data.referenceId).toBeUndefined();
  });

  it("refuses ORD-101 cancellation", async () => {
    const res = await action({ order_id: "101", action: "cancel" });
    expect(res.body.data).toMatchObject({ eligible: false, reasonCode: "NOT_CANCELLABLE_IN_TRANSIT" });
  });

  it("refuses ORD-102 damage replacement after 48h", async () => {
    const res = await action({ order_id: "ORD-102", action: "damage_replacement" });
    expect(res.body.data.reasonCode).toBe("DAMAGE_REPORT_WINDOW_EXPIRED");
  });

  it("returns not found for unknown ids", async () => {
    const res = await action({ order_id: "ORD-555", action: "cancel" });
    expect(res.body.data).toEqual({ found: false, reason: "NOT_FOUND", heard: "ORD-555" });
  });

  it("rejects an unknown action with 400", async () => {
    const res = await action({ order_id: "ORD-103", action: "refund" });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors).toHaveProperty("action");
  });
});

describe("unknown tools", () => {
  it("returns 404", async () => {
    const res = await request(app).post("/api/tools/book_flight").send({});
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Unknown tool" });
  });
});
