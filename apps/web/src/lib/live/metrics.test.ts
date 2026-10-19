import { describe, expect, it } from "vitest";

import { createMetrics, percentile } from "@/lib/live/metrics";

function clock(start = 0) {
  let t = start;
  return { now: () => t, at: (ms: number) => (t = ms) };
}

describe("createMetrics", () => {
  it("measures connect time and time to the first audio", () => {
    const c = clock();
    const m = createMetrics(c.now);
    m.started();
    c.at(900);
    m.opened();
    c.at(1600);
    m.agentAudio();
    c.at(1700);
    m.agentAudio();
    expect(m.finish("voice")).toMatchObject({ connectMs: 900, firstAudioMs: 700, turnLatenciesMs: [] });
  });

  it("times each reply from the last customer sound to the first reply audio", () => {
    const c = clock();
    const m = createMetrics(c.now);
    m.started();
    m.opened();
    c.at(1000);
    m.customerSpoke();
    c.at(1200);
    m.customerSpoke();
    c.at(2000);
    m.agentAudio();
    c.at(2100);
    m.agentAudio();
    c.at(5000);
    m.customerSpoke();
    c.at(5650);
    m.agentAudio();
    expect(m.finish("voice").turnLatenciesMs).toEqual([800, 650]);
  });

  it("counts tools, interruptions, reconnects and errors", () => {
    const c = clock();
    const m = createMetrics(c.now);
    m.started();
    m.toolDone("get_order_details", 120, true);
    m.toolDone("check_order_action", 5000, false);
    m.interrupted();
    m.interrupted();
    m.reconnected();
    m.error("Call disconnected: network");
    c.at(60_000);
    expect(m.finish("text")).toMatchObject({
      toolCalls: [
        { name: "get_order_details", ms: 120, ok: true },
        { name: "check_order_action", ms: 5000, ok: false },
      ],
      interruptions: 2,
      reconnects: 1,
      errors: ["Call disconnected: network"],
      durationMs: 60_000,
      inputMode: "text",
    });
  });

  it("leaves connect and first audio empty when the call never opened", () => {
    const m = createMetrics(clock().now);
    m.started();
    expect(m.finish("voice")).toMatchObject({ connectMs: null, firstAudioMs: null });
  });
});

describe("percentile", () => {
  it("returns the median and the 95th percentile", () => {
    const values = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
    expect(percentile(values, 50)).toBe(500);
    expect(percentile(values, 95)).toBe(1000);
  });

  it("is null for no values", () => {
    expect(percentile([], 50)).toBeNull();
  });
});
