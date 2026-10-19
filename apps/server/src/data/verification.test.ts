import { describe, expect, it } from "vitest";

import { MAX_FAILURES, isLocked, recordFailure } from "@/data/verification";

const MINUTE = 60_000;

describe("verification lockout", () => {
  it("locks after the maximum number of failures", () => {
    const now = new Date("2026-10-20T05:00:00Z");
    for (let i = 1; i < MAX_FAILURES; i++) recordFailure("ip-a:ORD-101", now);
    expect(isLocked("ip-a:ORD-101", now)).toBe(false);
    recordFailure("ip-a:ORD-101", now);
    expect(isLocked("ip-a:ORD-101", now)).toBe(true);
  });

  it("unlocks once the failures are older than 15 minutes", () => {
    const start = new Date("2026-10-20T05:00:00Z");
    for (let i = 0; i < MAX_FAILURES; i++) recordFailure("ip-b:ORD-101", start);
    expect(isLocked("ip-b:ORD-101", new Date(start.getTime() + 15 * MINUTE + 1))).toBe(false);
  });

  it("keeps different callers and orders apart", () => {
    const now = new Date("2026-10-20T05:00:00Z");
    for (let i = 0; i < MAX_FAILURES; i++) recordFailure("ip-c:ORD-102", now);
    expect(isLocked("ip-d:ORD-102", now)).toBe(false);
    expect(isLocked("ip-c:ORD-103", now)).toBe(false);
  });
});
