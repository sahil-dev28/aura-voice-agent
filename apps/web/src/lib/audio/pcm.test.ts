import { describe, expect, it } from "vitest";

import { base64ToBytes, bytesToBase64, downsample, floatToPcm16, pcm16ToFloat, rms } from "@/lib/audio/pcm";

describe("downsample", () => {
  it("48k -> 16k divides length by 3 and averages", () => {
    const input = new Float32Array([0.3, 0.3, 0.3, -0.6, -0.6, -0.6]);
    const out = downsample(input, 48_000);
    expect(out).toHaveLength(2);
    expect(out[0]).toBeCloseTo(0.3);
    expect(out[1]).toBeCloseTo(-0.6);
  });

  it("44.1k -> 16k produces the right length with no NaN", () => {
    const input = new Float32Array(1764).map((_, i) => Math.sin(i / 10));
    const out = downsample(input, 44_100);
    expect(out).toHaveLength(640);
    expect(out.every((v) => Number.isFinite(v) && Math.abs(v) <= 1)).toBe(true);
  });

  it("returns input unchanged at 16k", () => {
    const input = new Float32Array([0.1, 0.2]);
    expect(downsample(input, 16_000)).toBe(input);
  });
});

describe("pcm16 conversion", () => {
  it("clamps and scales floats", () => {
    expect(Array.from(floatToPcm16(new Float32Array([0, 1, -1, 2, -2])))).toEqual([0, 32767, -32768, 32767, -32768]);
  });

  it("round-trips approximately", () => {
    const back = pcm16ToFloat(floatToPcm16(new Float32Array([0.5, -0.25])));
    expect(back[0]).toBeCloseTo(0.5, 3);
    expect(back[1]).toBeCloseTo(-0.25, 3);
  });
});

describe("base64", () => {
  it("round-trips bytes", () => {
    const bytes = new Uint8Array([0, 1, 254, 255, 128]);
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
  });

  it("encodes large buffers without stack overflow", () => {
    const bytes = new Uint8Array(200_000).fill(7);
    expect(base64ToBytes(bytesToBase64(bytes))).toHaveLength(200_000);
  });
});

describe("rms", () => {
  it("measures loudness", () => {
    expect(rms(new Float32Array([0.5, -0.5, 0.5, -0.5]))).toBeCloseTo(0.5);
  });

  it("is 0 for silence and empty input", () => {
    expect(rms(new Float32Array(4))).toBe(0);
    expect(rms(new Float32Array(0))).toBe(0);
  });
});
