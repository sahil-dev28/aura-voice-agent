import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { rateLimit } from "@/middleware/rateLimitMiddleware";

describe("rateLimit", () => {
  it("allows max requests per window then returns 429", async () => {
    const app = express();
    app.post("/x", rateLimit({ max: 5, windowMs: 60_000 }), (_req, res) => {
      res.status(200).json({ data: true });
    });

    for (let i = 0; i < 5; i++) {
      expect((await request(app).post("/x")).status).toBe(200);
    }
    const blocked = await request(app).post("/x");
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/too many/i);
  });
});
