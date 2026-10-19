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

  it("declares all three tools", () => {
    const names = config.tools?.flatMap((tool) =>
      "functionDeclarations" in tool ? (tool.functionDeclarations ?? []).map((fn) => fn.name) : [],
    );
    expect(names).toEqual(["get_order_details", "check_order_action", "confirm_order_action"]);
  });

  it("makes every tool blocking so Aria waits for results", () => {
    const behaviors = config.tools?.flatMap((tool) =>
      "functionDeclarations" in tool ? (tool.functionDeclarations ?? []).map((fn) => fn.behavior) : [],
    );
    expect(behaviors).toEqual(["BLOCKING", "BLOCKING", "BLOCKING"]);
  });

  it("locks the system prompt and voice", () => {
    expect(String(config.systemInstruction)).toContain("Aria");
    expect(config.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName).toBeTruthy();
  });
});
