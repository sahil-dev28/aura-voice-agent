import { EndSensitivity, GoogleGenAI, type LiveConnectConfig, Modality, StartSensitivity } from "@google/genai";

import { env } from "@aura/env/server";

import { buildSystemPrompt } from "@/agent/systemPrompt";
import { toolDeclarations } from "@/agent/toolDeclarations";

let client: GoogleGenAI | undefined;

export function getGenAI(): GoogleGenAI {
  client ??= new GoogleGenAI({ apiKey: env.GEMINI_API_KEY, httpOptions: { apiVersion: "v1alpha" } });
  return client;
}

export function liveConnectConfig(now: Date): LiveConnectConfig {
  return {
    responseModalities: [Modality.AUDIO],
    systemInstruction: buildSystemPrompt(now),
    tools: [{ functionDeclarations: toolDeclarations }],
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: env.GEMINI_VOICE } } },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    realtimeInputConfig: {
      automaticActivityDetection: {
        startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
        endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH,
        prefixPaddingMs: 20,
        silenceDurationMs: 500,
      },
    },
  };
}
