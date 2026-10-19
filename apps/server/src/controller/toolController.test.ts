import request from "supertest";
import { describe, expect, it } from "vitest";

import { app } from "@/app";

const lookup = (body: object) => request(app).post("/api/tools/get_order_details").send(body);
const action = (body: object) => request(app).post("/api/tools/check_order_action").send(body);
const confirm = (body: object) => request(app).post("/api/tools/confirm_order_action").send(body);
const escalate = (body: object) => request(app).post("/api/tools/escalate_to_human").send(body);

describe("GET /api/orders", () => {
  it("lists the test orders with derived fields", async () => {
    const res = await request(app).get("/api/orders");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(4);
    expect(res.body.data[1]).toMatchObject({ orderId: "ORD-102", shippingFeeInr: 0, codEligible: true, deliveredDaysAgo: 14 });
  });
});

describe("POST /api/tools/get_order_details", () => {
  it("finds ORD-101 from a spoken id", async () => {
    const res = await lookup({ order_id: "order one oh one", phone_last4: "3721" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      found: true,
      order: { orderId: "ORD-101", status: "OUT_FOR_DELIVERY", carrier: "BlueDart" },
      cancel: { eligible: false, reasonCode: "NOT_CANCELLABLE_IN_TRANSIT" },
    });
    expect(res.body.data.order.expectedBy).toMatch(/6:00[\s\u202f]?pm IST$/i);
    expect(res.body.data.order.orderedAt).toMatch(/IST$/);
  });

  it("gives delivery dates in IST so the model doesn't read UTC as local time", async () => {
    const res = await lookup({ order_id: "ORD-102", phone_last4: "5508" });
    expect(res.body.data.order.deliveredAt).toMatch(/^\d{1,2} \w{3} \d{4}, .+ IST$/);
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
    const res = await lookup({ order_id: "ORD-103", phone_last4: "9264", note: "x" });
    expect(res.body.data.found).toBe(true);
  });
});

describe("customer verification", () => {
  it("asks for verification before sharing any order detail", async () => {
    const res = await lookup({ order_id: "ORD-101" });
    expect(res.body.data).toEqual({ found: true, orderId: "ORD-101", verified: false, reason: "NEEDS_VERIFICATION" });
  });

  it("refuses the wrong digits without sharing details", async () => {
    const res = await lookup({ order_id: "ORD-101", phone_last4: "0000" });
    expect(res.body.data).toEqual({ found: true, orderId: "ORD-101", verified: false, reason: "VERIFICATION_FAILED" });
  });

  it("accepts the digits as spoken words", async () => {
    const res = await lookup({ order_id: "ORD-101", phone_last4: "three seven two one" });
    expect(res.body.data).toMatchObject({ found: true, order: { orderId: "ORD-101" } });
  });

  it("does not check or record an action without verification", async () => {
    const check = await action({ order_id: "ORD-103", action: "cancel" });
    expect(check.body.data).toMatchObject({ verified: false, reason: "NEEDS_VERIFICATION" });
    expect(check.body.data.eligible).toBeUndefined();
    const record = await confirm({ order_id: "ORD-103", action: "cancel", phone_last4: "1111" });
    expect(record.body.data).toMatchObject({ verified: false, reason: "VERIFICATION_FAILED" });
    expect(record.body.data.referenceId).toBeUndefined();
  });

  it("still reports unknown ids first, so the customer can fix the id", async () => {
    const res = await lookup({ order_id: "ORD-109" });
    expect(res.body.data).toMatchObject({ found: false, reason: "NOT_FOUND" });
  });

  it("locks the order for this caller after 5 wrong attempts", async () => {
    const from = (ip: string, phone: string) =>
      request(app).post("/api/tools/get_order_details").set("X-Forwarded-For", ip).send({ order_id: "ORD-102", phone_last4: phone });
    for (let i = 0; i < 5; i++) await from("10.0.0.9", "0000");
    const locked = await from("10.0.0.9", "5508");
    expect(locked.body.data).toMatchObject({ verified: false, reason: "VERIFICATION_LOCKED" });
    const other = await from("10.0.0.10", "5508");
    expect(other.body.data).toMatchObject({ found: true, order: { orderId: "ORD-102" } });
  });
});

describe("POST /api/tools/check_order_action", () => {
  it("says ORD-103 can be cancelled without recording it", async () => {
    const res = await action({ order_id: "ORD-103", phone_last4: "9264", action: "cancel" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ found: true, orderId: "ORD-103", action: "cancel", eligible: true });
    expect(res.body.data.referenceId).toBeUndefined();
    expect(res.body.data.nextStep).toMatch(/confirm/i);
  });

  it("refuses ORD-102 return without a reference", async () => {
    const res = await action({ order_id: "ORD-102", phone_last4: "5508", action: "return", product_opened: false });
    expect(res.body.data).toMatchObject({ eligible: false, reasonCode: "RETURN_WINDOW_EXPIRED" });
    expect(res.body.data.referenceId).toBeUndefined();
  });

  it("refuses ORD-101 cancellation", async () => {
    const res = await action({ order_id: "101", phone_last4: "3721", action: "cancel" });
    expect(res.body.data).toMatchObject({ eligible: false, reasonCode: "NOT_CANCELLABLE_IN_TRANSIT" });
  });

  it("refuses ORD-102 damage replacement after 48h", async () => {
    const res = await action({ order_id: "ORD-102", phone_last4: "5508", action: "damage_replacement" });
    expect(res.body.data.reasonCode).toBe("DAMAGE_REPORT_WINDOW_EXPIRED");
  });

  it("returns not found for unknown ids", async () => {
    const res = await action({ order_id: "ORD-555", action: "cancel" });
    expect(res.body.data).toEqual({ found: false, reason: "NOT_FOUND", heard: "ORD-555" });
  });

  it("rejects an unknown action with 400", async () => {
    const res = await action({ order_id: "ORD-103", phone_last4: "9264", action: "refund" });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors).toHaveProperty("action");
  });
});

describe("POST /api/tools/confirm_order_action", () => {
  it("records the ORD-103 cancellation with a CXL reference", async () => {
    const res = await confirm({ order_id: "ORD-103", phone_last4: "9264", action: "cancel" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ found: true, orderId: "ORD-103", action: "cancel", eligible: true, confirmed: true });
    expect(res.body.data.referenceId).toMatch(/^CXL-[0-9A-F]{4}$/);
    expect(res.body.data.nextStep).toMatch(/recorded/i);
  });

  it("returns the same reference when confirmed twice", async () => {
    const first = await confirm({ order_id: "ORD-103", phone_last4: "9264", action: "cancel" });
    const second = await confirm({ order_id: "order one zero three", phone_last4: "9264", action: "cancel" });
    expect(second.body.data.referenceId).toBe(first.body.data.referenceId);
  });

  it("re-checks policy and refuses ORD-101 cancellation", async () => {
    const res = await confirm({ order_id: "ORD-101", phone_last4: "3721", action: "cancel" });
    expect(res.body.data).toMatchObject({ eligible: false, confirmed: false, reasonCode: "NOT_CANCELLABLE_IN_TRANSIT" });
    expect(res.body.data.referenceId).toBeUndefined();
  });

  it("records an ORD-104 damage replacement and asks for photos", async () => {
    const res = await confirm({ order_id: "ORD-104", phone_last4: "1187", action: "damage_replacement" });
    expect(res.body.data).toMatchObject({ confirmed: true, photoUpload: { maxPhotos: 3, photoCount: 0 } });
    expect(res.body.data.referenceId).toMatch(/^RPL-[0-9A-F]{4}$/);
    expect(res.body.data.nextStep).toMatch(/upload/i);
  });

  it("only offers a photo upload for replacements", async () => {
    const res = await confirm({ order_id: "ORD-103", phone_last4: "9264", action: "cancel" });
    expect(res.body.data.photoUpload).toBeUndefined();
  });

  it("does not record a return before the customer says whether it was opened", async () => {
    const res = await confirm({ order_id: "ORD-102", phone_last4: "5508", action: "return" });
    expect(res.body.data).toMatchObject({ confirmed: false });
    expect(res.body.data.referenceId).toBeUndefined();
  });

  it("returns not found for unknown ids", async () => {
    const res = await confirm({ order_id: "ORD-555", action: "cancel" });
    expect(res.body.data).toEqual({ found: false, reason: "NOT_FOUND", heard: "ORD-555" });
  });

  it("rejects an unknown action with 400", async () => {
    const res = await confirm({ order_id: "ORD-103", phone_last4: "9264", action: "refund" });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors).toHaveProperty("action");
  });
});

describe("POST /api/tools/escalate_to_human", () => {
  it("opens an ESC ticket with a callback promise", async () => {
    const res = await escalate({ reason: "policy_dispute", order_id: "order one zero two", note: "Wants a return after 14 days." });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ escalated: true, reason: "policy_dispute", orderId: "ORD-102" });
    expect(res.body.data.ticketId).toMatch(/^ESC-[0-9A-F]{4}$/);
    expect(res.body.data.nextStep).toMatch(/within one business day/);
  });

  it("escalates without an order", async () => {
    const res = await escalate({ reason: "customer_request", note: "Asked for a person." });
    expect(res.body.data).toMatchObject({ escalated: true, orderId: null });
  });

  it("still escalates when the order id is not recognised", async () => {
    const res = await escalate({ reason: "unclear_audio", order_id: "banana", note: "Could not hear the order id." });
    expect(res.body.data).toMatchObject({ escalated: true, orderId: null });
  });

  it("rejects an unknown reason with 400", async () => {
    const res = await escalate({ reason: "bored", note: "x" });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors).toHaveProperty("reason");
  });

  it("rejects a missing note with 400", async () => {
    const res = await escalate({ reason: "customer_request" });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors).toHaveProperty("note");
  });
});

describe("unknown tools", () => {
  it("returns 404", async () => {
    const res = await request(app).post("/api/tools/book_flight").send({});
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Unknown tool" });
  });
});

describe("tool rate limit", () => {
  it("returns 429 after the per-IP limit", async () => {
    let last = 0;
    for (let i = 0; i < 125; i++) {
      last = (await lookup({ order_id: "ORD-101", phone_last4: "3721" })).status;
    }
    expect(last).toBe(429);
  });
});
