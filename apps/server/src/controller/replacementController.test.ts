import request from "supertest";
import { describe, expect, it } from "vitest";

import { app } from "@/app";

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200)]).toString("base64");
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200)]).toString("base64");

const confirm = (body: object) => request(app).post("/api/tools/confirm_order_action").send(body);
const upload = (referenceId: string, body: object) =>
  request(app).post(`/api/replacements/${referenceId}/photos`).send(body);

async function newReplacement(): Promise<string> {
  const res = await confirm({ order_id: "ORD-104", action: "damage_replacement" });
  return res.body.data.referenceId as string;
}

describe("POST /api/replacements/:referenceId/photos", () => {
  it("accepts a JPEG and counts it", async () => {
    const ref = await newReplacement();
    const res = await upload(ref, { mime_type: "image/jpeg", data: JPEG });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ referenceId: ref, orderId: "ORD-104", photoCount: expect.any(Number), maxPhotos: 3 });
  });

  it("accepts a PNG", async () => {
    const ref = await newReplacement();
    const res = await upload(ref, { mime_type: "image/png", data: PNG });
    expect(res.status).toBe(200);
  });

  it("refuses a fourth photo with 409", async () => {
    const ref = await newReplacement();
    for (let i = 0; i < 3; i++) await upload(ref, { mime_type: "image/jpeg", data: JPEG });
    const res = await upload(ref, { mime_type: "image/jpeg", data: JPEG });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/3 photos/);
  });

  it("returns 404 for an unknown reference", async () => {
    const res = await upload("RPL-0000", { mime_type: "image/jpeg", data: JPEG });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Replacement request not found" });
  });

  it("returns 404 for a reference that is not a replacement", async () => {
    const cancel = await confirm({ order_id: "ORD-103", action: "cancel" });
    const res = await upload(cancel.body.data.referenceId, { mime_type: "image/jpeg", data: JPEG });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Replacement request not found" });
  });

  it("rejects data that is not the declared image type", async () => {
    const ref = await newReplacement();
    const res = await upload(ref, { mime_type: "image/jpeg", data: Buffer.from("not an image at all").toString("base64") });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/JPEG, PNG or WebP/);
  });

  it("rejects an unsupported type", async () => {
    const ref = await newReplacement();
    const res = await upload(ref, { mime_type: "image/gif", data: JPEG });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors).toHaveProperty("mime_type");
  });

  it("rejects a photo over 700 KB", async () => {
    const ref = await newReplacement();
    const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(710_000)]).toString("base64");
    const res = await upload(ref, { mime_type: "image/jpeg", data: big });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/too large/i);
  });
});
