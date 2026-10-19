import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();

vi.mock("@/utils/gemini", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/utils/gemini")>();
  return { ...actual, getGenAI: () => ({ authTokens: { create } }) };
});

const { app } = await import("@/app");

describe("POST /api/token", () => {
  beforeEach(() => create.mockReset());

  it("mints a single-use token with the locked live config", async () => {
    create.mockResolvedValueOnce({ name: "auth_tokens/abc" });
    const res = await request(app).post("/api/token");

    expect(res.status).toBe(200);
    expect(res.body.data.token).toBe("auth_tokens/abc");
    expect(res.body.data.model).toBeTruthy();

    const { config } = create.mock.calls[0]?.[0];
    expect(config.uses).toBe(1);
    expect(config).not.toHaveProperty("lockAdditionalFields");
    expect(config.liveConnectConstraints.model).toBe(res.body.data.model);
    expect(String(config.liveConnectConstraints.config.systemInstruction)).toContain("Aria");
    expect(new Date(config.expireTime).getTime()).toBeGreaterThan(Date.now() + 25 * 60_000);
    expect(config.liveConnectConstraints.config.sessionResumption).toEqual({});
  });

  it("locks a resume handle into the config when reconnecting", async () => {
    create.mockResolvedValueOnce({ name: "auth_tokens/def" });
    const res = await request(app).post("/api/token").send({ resume_handle: "handle-1" });

    expect(res.status).toBe(200);
    const { config } = create.mock.calls[0]?.[0];
    expect(config.liveConnectConstraints.config.sessionResumption).toEqual({ handle: "handle-1" });
  });

  it("rejects a resume handle that is not a string", async () => {
    const res = await request(app).post("/api/token").send({ resume_handle: 42 });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors).toHaveProperty("resume_handle");
    expect(create).not.toHaveBeenCalled();
  });

  it("hides upstream errors", async () => {
    create.mockImplementationOnce(async () => {
      throw new Error("API key not valid: secret");
    });
    const res = await request(app).post("/api/token");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Could not start call" });
  });
});
