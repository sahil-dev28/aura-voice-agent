import { describe, expect, it } from "vitest";

import { GREETING, buildSystemPrompt } from "@/agent/systemPrompt";

describe("buildSystemPrompt", () => {
  const prompt = buildSystemPrompt(new Date("2026-10-18T05:00:00Z"));

  it("sets the Aria persona and greeting", () => {
    expect(prompt).toContain("Aria");
    expect(prompt).toContain("Aura Skincare");
    expect(prompt).toContain(GREETING);
  });

  it("includes all brand policies", () => {
    for (const text of ["₹499", "₹50", "3–5 business days", "7 days of delivery", "48 hours", "Processing", "₹2,500"]) {
      expect(prompt).toContain(text);
    }
  });

  it("states the current IST date and time", () => {
    expect(prompt).toMatch(/18 October 2026/);
    expect(prompt).toMatch(/10:30\s?am/i);
    expect(prompt).toContain("IST");
  });

  it("contains the guardrails", () => {
    expect(prompt).toContain("get_order_details");
    expect(prompt).toContain("check_order_action");
    expect(prompt).toContain("confirm_order_action");
    expect(prompt).toMatch(/clearly say yes/i);
    expect(prompt).toContain("escalate_to_human");
    expect(prompt).toMatch(/straight away/i);
    expect(prompt).toContain("Call system:");
    expect(prompt).toMatch(/upload box/);
    expect(prompt).toContain("Customer (typed):");
    expect(prompt).toMatch(/without saying "IST"/);
    expect(prompt).toMatch(/only help with Aura Skincare/i);
    expect(prompt).toMatch(/repeat/i);
    expect(prompt).toMatch(/Hinglish/);
  });
});
