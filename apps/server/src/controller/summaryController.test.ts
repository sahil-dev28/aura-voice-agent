import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const generateContent = vi.fn();

vi.mock("@/utils/gemini", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/utils/gemini")>();
  return { ...actual, getGenAI: () => ({ models: { generateContent } }) };
});

const { app } = await import("@/app");

const body = {
  transcript: [
    { role: "agent", text: "Hi, this is Aria from Aura Skincare.", ts: 1 },
    { role: "customer", text: "Where is my order ORD-101?", ts: 2 },
    { role: "tool", text: "Looked up ORD-101: OUT_FOR_DELIVERY", ts: 3 },
    { role: "agent", text: "It is out for delivery and expected by 6 PM today.", ts: 4 },
  ],
  toolEvents: [{ name: "get_order_details", args: { order_id: "ORD-101" }, result: { found: true } }],
};

const outcome = {
  customer_intent: "ORDER_TRACKING",
  order_id: "ORD-101",
  resolution_status: "RESOLVED",
  sentiment: "POSITIVE",
  policy_flags: [],
  call_summary: "Customer asked about ORD-101. It is out for delivery, expected by 6 PM today.",
  follow_up_required: false,
};

describe("POST /api/summary", () => {
  beforeEach(() => generateContent.mockReset());

  it("returns the parsed outcome and sends a JSON schema", async () => {
    generateContent.mockResolvedValueOnce({ text: JSON.stringify(outcome) });
    const res = await request(app).post("/api/summary").send(body);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(outcome);
    const args = generateContent.mock.calls[0]?.[0];
    expect(args.config.responseMimeType).toBe("application/json");
    expect(args.config.responseJsonSchema).toBeTruthy();
    expect(args.contents).toContain("Customer: Where is my order ORD-101?");
    expect(args.contents).toContain("escalate_to_human");
  });

  it("500s when the model returns invalid JSON shape", async () => {
    generateContent.mockResolvedValueOnce({ text: JSON.stringify({ customer_intent: "FLIGHTS" }) });
    const res = await request(app).post("/api/summary").send(body);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Could not generate summary" });
  });

  it("500s when the upstream call fails", async () => {
    generateContent.mockImplementationOnce(async () => {
      throw new Error("quota");
    });
    const res = await request(app).post("/api/summary").send(body);
    expect(res.status).toBe(500);
  });

  it("retries once when the upstream call fails", async () => {
    generateContent
      .mockImplementationOnce(async () => {
        throw new Error("503 model overloaded");
      })
      .mockResolvedValueOnce({ text: JSON.stringify(outcome) });
    const res = await request(app).post("/api/summary").send(body);
    expect(res.status).toBe(200);
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it("retries once when the model output does not match the schema", async () => {
    generateContent
      .mockResolvedValueOnce({ text: JSON.stringify({ customer_intent: "FLIGHTS" }) })
      .mockResolvedValueOnce({ text: JSON.stringify(outcome) });
    const res = await request(app).post("/api/summary").send(body);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(outcome);
  });

  it("gives up after two failed attempts", async () => {
    generateContent.mockImplementation(async () => {
      throw new Error("quota");
    });
    const res = await request(app).post("/api/summary").send(body);
    expect(res.status).toBe(500);
    expect(generateContent).toHaveBeenCalledTimes(2);
    generateContent.mockReset();
  });

  it("400s when the transcript is over the character cap", async () => {
    const long = Array.from({ length: 20 }, (_, i) => ({ role: "customer", text: "x".repeat(4000), ts: i }));
    const res = await request(app).post("/api/summary").send({ transcript: long, toolEvents: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/too long/i);
  });

  it("400s on an empty transcript", async () => {
    const res = await request(app).post("/api/summary").send({ transcript: [], toolEvents: [] });
    expect(res.status).toBe(400);
  });

  it("rate-limits summary requests", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      statuses.push((await request(app).post("/api/summary").send({ transcript: [], toolEvents: [] })).status);
    }
    expect(statuses).toContain(429);
  });
});
