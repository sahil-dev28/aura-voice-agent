import {
  type FunctionCall,
  type FunctionResponse,
  GoogleGenAI,
  type LiveServerMessage,
  type Session,
} from "@google/genai";

import { ApiError, callTool, getToken } from "@/lib/api";
import { type AudioPlayer, createAudioPlayer } from "@/lib/audio/audio-player";
import { type MicRecorder, startMicRecorder } from "@/lib/audio/mic-recorder";
import type { SessionEvent } from "@/lib/live/sessionReducer";
import { describeToolEvent, filterCancelled } from "@/lib/live/toolEvents";
import { addToolEntry, appendTranscript } from "@/lib/live/transcript";
import type { ToolEvent, TranscriptEntry } from "@/lib/types";

export type LiveCallHandlers = {
  onEvent: (event: SessionEvent) => void;
  onTranscript: (entries: TranscriptEntry[]) => void;
  onToolEvents: (events: ToolEvent[]) => void;
  onFinished: (call: { transcript: TranscriptEntry[]; toolEvents: ToolEvent[] }) => void;
};

const USER_PAUSE_MS = 700;
const TOOL_TIMEOUT_MS = 5000;
const GREETING_TRIGGER = "The customer has just joined the call. Greet them now.";

function startErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Microphone access is blocked. Allow microphone access for this site and try again.";
  }
  if (error instanceof DOMException && error.name === "NotFoundError") return "No microphone was found.";
  if (error instanceof ApiError) return error.message;
  return "Couldn't start the call, please try again.";
}

export function createLiveCall(handlers: LiveCallHandlers) {
  let session: Session | null = null;
  let mic: MicRecorder | null = null;
  let player: AudioPlayer | null = null;
  let pauseTimer: ReturnType<typeof setTimeout> | undefined;
  let active = false;
  let transcript: TranscriptEntry[] = [];
  let toolEvents: ToolEvent[] = [];
  const cancelled = new Set<string>();

  const setTranscript = (next: TranscriptEntry[]) => {
    transcript = next;
    handlers.onTranscript(next);
  };

  const teardown = () => {
    clearTimeout(pauseTimer);
    mic?.stop();
    mic = null;
    session?.close();
    session = null;
    player?.close();
    player = null;
  };

  const finish = (event: SessionEvent) => {
    if (!active) return;
    active = false;
    teardown();
    handlers.onEvent(event);
    handlers.onFinished({ transcript, toolEvents });
  };

  const end = () => finish({ type: "END" });
  const fail = (message: string) => finish({ type: "ERROR", message });

  async function runTools(calls: FunctionCall[]) {
    handlers.onEvent({ type: "TOOL_CALL" });
    const responses: FunctionResponse[] = await Promise.all(
      calls.map(async (call) => {
        const name = call.name ?? "";
        const args = (call.args ?? {}) as Record<string, unknown>;
        let result: Record<string, unknown>;
        try {
          result = (await callTool(name, args, AbortSignal.timeout(TOOL_TIMEOUT_MS))) as Record<string, unknown>;
        } catch (error) {
          result = { error: error instanceof ApiError && error.status < 500 ? error.message : "LOOKUP_UNAVAILABLE" };
        }
        const ts = Date.now();
        toolEvents = [...toolEvents, { id: call.id ?? `${name}-${ts}`, name, args, result, ts }];
        handlers.onToolEvents(toolEvents);
        setTranscript(addToolEntry(transcript, describeToolEvent(name, args, result), ts));
        return { id: call.id, name, response: "error" in result ? { error: result.error } : { output: result } };
      }),
    );
    const live = filterCancelled(responses, cancelled);
    if (active && session && live.length) session.sendToolResponse({ functionResponses: live });
  }

  function handleMessage(message: LiveServerMessage) {
    const content = message.serverContent;
    if (content) {
      if (content.interrupted) {
        player?.flush();
        handlers.onEvent({ type: "INTERRUPTED" });
      }
      const userText = content.inputTranscription?.text;
      if (userText) {
        setTranscript(appendTranscript(transcript, "customer", userText, Date.now()));
        handlers.onEvent({ type: "USER_TRANSCRIPT" });
        clearTimeout(pauseTimer);
        pauseTimer = setTimeout(() => handlers.onEvent({ type: "USER_PAUSE" }), USER_PAUSE_MS);
      }
      const agentText = content.outputTranscription?.text;
      if (agentText) setTranscript(appendTranscript(transcript, "agent", agentText, Date.now()));
      for (const part of content.modelTurn?.parts ?? []) {
        const data = part.inlineData?.data;
        if (data && part.inlineData?.mimeType?.startsWith("audio/")) {
          player?.enqueue(data);
          handlers.onEvent({ type: "AUDIO_CHUNK" });
        }
      }
      if (content.turnComplete) handlers.onEvent({ type: "TURN_COMPLETE" });
    }
    for (const id of message.toolCallCancellation?.ids ?? []) cancelled.add(id);
    if (message.toolCall?.functionCalls?.length) void runTools(message.toolCall.functionCalls);
    if (message.goAway) end();
  }

  async function start() {
    if (active) return;
    active = true;
    transcript = [];
    toolEvents = [];
    cancelled.clear();
    handlers.onTranscript([]);
    handlers.onToolEvents([]);
    handlers.onEvent({ type: "START" });

    try {
      player = await createAudioPlayer(() => handlers.onEvent({ type: "PLAYBACK_DRAINED" }));
      if (!active) return teardown();
      mic = await startMicRecorder((data) =>
        session?.sendRealtimeInput({ audio: { data, mimeType: "audio/pcm;rate=16000" } }),
      );
      if (!active) return teardown();
      const { token, model } = await getToken();
      if (!active) return teardown();

      const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: "v1alpha" } });
      const connected = await ai.live.connect({
        model,
        callbacks: {
          onmessage: handleMessage,
          onerror: () => fail("The call connection failed. Please try again."),
          onclose: (event) => {
            if (active) fail(event.reason ? `Call disconnected: ${event.reason}` : "The call was disconnected.");
          },
        },
      });
      if (!active) {
        connected.close();
        return;
      }
      session = connected;
      handlers.onEvent({ type: "OPEN" });
      session.sendClientContent({ turns: [{ role: "user", parts: [{ text: GREETING_TRIGGER }] }], turnComplete: true });
    } catch (error) {
      fail(startErrorMessage(error));
    }
  }

  const dispose = () => {
    active = false;
    teardown();
  };

  return { start, end, dispose };
}
