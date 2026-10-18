import request from "supertest";
import { describe, expect, it } from "vitest";

import { app } from "@/app";

describe("GET /api/health", () => {
  it("returns ok", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { ok: true } });
  });

  it.each(["http://localhost:3000", "http://localhost:3001"])("allows CORS origin %s", async (origin) => {
    const res = await request(app).get("/api/health").set("Origin", origin);
    expect(res.headers["access-control-allow-origin"]).toBe(origin);
  });

  it("rejects other origins", async () => {
    const res = await request(app).get("/api/health").set("Origin", "https://evil.example");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
