import { Modality } from "@google/genai";
import { describe, expect, it } from "vitest";

import { liveConnectConfig } from "@/utils/gemini";

describe("liveConnectConfig", () => {
  const config = liveConnectConfig(new Date("2026-10-18T05:00:00Z"));

  it("is audio-only with both transcriptions on", () => {
    expect(config.responseModalities).toEqual([Modality.AUDIO]);
    expect(config.inputAudioTranscription).toEqual({});
    expect(config.outputAudioTranscription).toEqual({});
  });

  it("declares all four tools", () => {
    const names = config.tools?.flatMap((tool) =>
      "functionDeclarations" in tool ? (tool.functionDeclarations ?? []).map((fn) => fn.name) : [],
    );
    expect(names).toEqual(["get_order_details", "check_order_action", "confirm_order_action", "escalate_to_human"]);
  });

  it("asks for the phone digits on every order tool", () => {
    const declarations = config.tools?.flatMap((tool) => ("functionDeclarations" in tool ? (tool.functionDeclarations ?? []) : []));
    const withPhone = declarations?.filter((fn) => fn.parameters?.properties?.phone_last4).map((fn) => fn.name);
    expect(withPhone).toEqual(["get_order_details", "check_order_action", "confirm_order_action"]);
  });

  it("makes every tool blocking so Aria waits for results", () => {
    const behaviors = config.tools?.flatMap((tool) =>
      "functionDeclarations" in tool ? (tool.functionDeclarations ?? []).map((fn) => fn.behavior) : [],
    );
    expect(behaviors).toEqual(["BLOCKING", "BLOCKING", "BLOCKING", "BLOCKING"]);
  });

  it("turns on session resumption, with the handle when resuming", () => {
    expect(config.sessionResumption).toEqual({});
    expect(liveConnectConfig(new Date(), "handle-1").sessionResumption).toEqual({ handle: "handle-1" });
  });

  it("locks the system prompt and voice", () => {
    expect(String(config.systemInstruction)).toContain("Aria");
    expect(config.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName).toBeTruthy();
  });
});
