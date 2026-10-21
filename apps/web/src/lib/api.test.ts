import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@aura/env/web", () => ({ env: { NEXT_PUBLIC_SERVER_URL: "http://api.test" } }));

const { ApiError, getToken } = await import("@/lib/api");

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const token = { token: "t", model: "m", expiresAt: "2026-01-01T00:00:00Z" };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("getToken", () => {
  it("keeps trying while the server wakes up", async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(json(503, {}))
      .mockResolvedValueOnce(json(200, { data: token }));
    vi.stubGlobal("fetch", fetch);

    const result = getToken();
    await vi.runAllTimersAsync();
    await expect(result).resolves.toEqual(token);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("does not retry a request the server rejected", async () => {
    const fetch = vi.fn().mockResolvedValue(json(429, { error: "Too many calls" }));
    vi.stubGlobal("fetch", fetch);

    await expect(getToken()).rejects.toThrow(ApiError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
