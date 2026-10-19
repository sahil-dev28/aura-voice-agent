import { describe, expect, it } from "vitest";

import { orbTarget, smooth } from "@/lib/live/orb";

describe("orbTarget", () => {
  it("follows Aria's voice while she speaks", () => {
    expect(orbTarget("speaking", { agent: 0.1, mic: 0.5 })).toBeCloseTo(0.4);
    expect(orbTarget("speaking", { agent: 0.6, mic: 0 })).toBe(1);
  });

  it("moves gently with the customer's voice while listening", () => {
    expect(orbTarget("listening", { agent: 0, mic: 0.05 })).toBeCloseTo(0.15);
    expect(orbTarget("listening", { agent: 0, mic: 0.9 })).toBe(0.4);
  });

  it("stays still in every other state", () => {
    for (const status of ["idle", "connecting", "thinking", "ended", "error"] as const) {
      expect(orbTarget(status, { agent: 0.5, mic: 0.5 })).toBe(0);
    }
  });
});

describe("smooth", () => {
  it("moves part of the way toward the target each frame", () => {
    expect(smooth(0, 1)).toBeCloseTo(0.25);
    expect(smooth(1, 0)).toBeCloseTo(0.75);
  });
});
