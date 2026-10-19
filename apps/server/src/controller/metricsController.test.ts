import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { app } from "@/app";

const metrics = {
  inputMode: "voice",
  durationMs: 95_000,
  connectMs: 900,
  firstAudioMs: 700,
  turnLatenciesMs: [800, 650, 1200, 900],
  toolCalls: [
    { name: "get_order_details", ms: 120, ok: true },
    { name: "check_order_action", ms: 5000, ok: false },
  ],
  interruptions: 1,
  reconnects: 0,
  errors: [],
};

const send = (body: object) => request(app).post("/api/metrics").send(body);

describe("POST /api/metrics", () => {
  afterEach(() => vi.restoreAllMocks());

  it("logs one JSON line with the raw numbers and percentiles", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const res = await send(metrics);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { received: true } });
    expect(info).toHaveBeenCalledTimes(1);
    const line = JSON.parse(String(info.mock.calls[0]?.[0]));
    expect(line).toMatchObject({
      event: "call_metrics",
      connectMs: 900,
      turnLatencyP50Ms: 800,
      turnLatencyP95Ms: 1200,
      toolCallP95Ms: 5000,
      toolFailures: 1,
    });
  });

  it("rejects negative timings", async () => {
    const res = await send({ ...metrics, connectMs: -5 });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors).toHaveProperty("connectMs");
  });

  it("rejects oversized lists", async () => {
    const res = await send({ ...metrics, turnLatenciesMs: Array.from({ length: 500 }, () => 100) });
    expect(res.status).toBe(400);
  });
});
