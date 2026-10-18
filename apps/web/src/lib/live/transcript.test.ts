import { describe, expect, it } from "vitest";

import { addToolEntry, appendTranscript, hasCustomerSpeech, toSummaryTranscript } from "@/lib/live/transcript";

describe("transcript", () => {
  it("merges consecutive chunks from the same speaker", () => {
    let t = appendTranscript([], "customer", "Where is", 1);
    t = appendTranscript(t, "customer", " my order?", 2);
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ role: "customer", text: "Where is my order?", ts: 1 });
  });

  it("starts a new entry when the speaker changes", () => {
    let t = appendTranscript([], "agent", "Hi", 1);
    t = appendTranscript(t, "customer", "Hello", 2);
    t = appendTranscript(t, "agent", "How can I help?", 3);
    expect(t.map((e) => e.role)).toEqual(["agent", "customer", "agent"]);
    expect(new Set(t.map((e) => e.id)).size).toBe(3);
  });

  it("tool rows split agent speech", () => {
    let t = appendTranscript([], "agent", "Let me check.", 1);
    t = addToolEntry(t, "Looked up ORD-101", 2);
    t = appendTranscript(t, "agent", "It is out for delivery.", 3);
    expect(t.map((e) => e.role)).toEqual(["agent", "tool", "agent"]);
  });

  it("ignores empty chunks", () => {
    expect(appendTranscript([], "agent", "", 1)).toEqual([]);
  });

  it("summary transcript trims and drops blank entries", () => {
    const t = appendTranscript(appendTranscript([], "agent", "  Hi  ", 1), "customer", "   ", 2);
    expect(toSummaryTranscript(t)).toEqual([{ role: "agent", text: "Hi", ts: 1 }]);
  });

  it("detects customer speech", () => {
    expect(hasCustomerSpeech(appendTranscript([], "agent", "Hi", 1))).toBe(false);
    expect(hasCustomerSpeech(appendTranscript([], "customer", "Hi", 1))).toBe(true);
  });
});
