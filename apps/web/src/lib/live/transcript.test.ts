import { describe, expect, it } from "vitest";

import {
  addToolEntry,
  appendTranscript,
  closeTurn,
  formatSpokenIds,
  hasCustomerSpeech,
  toSummaryTranscript,
} from "@/lib/live/transcript";

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

  it("starts a new entry after the turn is closed", () => {
    let t = appendTranscript([], "agent", "Your ticket is ready.", 1);
    t = closeTurn(t);
    t = appendTranscript(t, "agent", "Are you still there?", 2);
    expect(t.map((e) => e.text)).toEqual(["Your ticket is ready.", "Are you still there?"]);
  });

  it("closing an empty transcript is a no-op", () => {
    expect(closeTurn([])).toEqual([]);
  });

  it("ignores empty chunks", () => {
    expect(appendTranscript([], "agent", "", 1)).toEqual([]);
  });

  it("summary transcript shows IDs in their written form", () => {
    const t = appendTranscript([], "agent", "Your reference is C X L eight F two one.", 1);
    expect(toSummaryTranscript(t)[0]?.text).toBe("Your reference is CXL-8F21.");
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

describe("formatSpokenIds", () => {
  it.each([
    ["ticket ID E S C three three seven nine.", "ticket ID ESC-3379."],
    ["reference ID is C X L eight F two one.", "reference ID is CXL-8F21."],
    ["Order O R D one zero three is still processing", "Order ORD-103 is still processing"],
    ["order ORD one oh one, right?", "order ORD-101, right?"],
    ["Can I cancel my order? ORD103", "Can I cancel my order? ORD-103"],
    ["R E T, four A nine C", "RET-4A9C"],
  ])("%s", (spoken, written) => {
    expect(formatSpokenIds(spoken)).toBe(written);
  });

  it.each(["I want to return my order.", "Escape the loop", "one two three four", "RETAIL price"])("leaves %s alone", (text) => {
    expect(formatSpokenIds(text)).toBe(text);
  });
});
