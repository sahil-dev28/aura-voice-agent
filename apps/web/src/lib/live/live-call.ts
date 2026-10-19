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
import { type SessionEvent, initialSessionState, sessionReducer } from "@/lib/live/sessionReducer";
import { describeToolEvent, filterCancelled, findEscalation } from "@/lib/live/toolEvents";
import { addToolEntry, appendTranscript, closeTurn } from "@/lib/live/transcript";
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
const SILENCE_MS = 10_000;
const SPEECH_LEVEL = 0.02;
const GOODBYE_GRACE_MS = 10_000;
const CALL_LIMIT_MS = 10 * 60_000;
const WRAP_UP_BEFORE_MS = 60_000;
const MAX_RESUMES = 3;
const STILL_THERE = "Call system: The customer has been silent for a while. Briefly ask if they are still there.";
const GOODBYE = "Call system: The customer is still silent. Say a short, polite goodbye now. The call ends after it.";
const WRAP_UP =
  "Call system: This call ends in about one minute. Wrap up now, and if the issue is not resolved, offer a specialist ticket.";

export function parseDurationMs(duration: string | undefined): number {
  const seconds = Number.parseFloat(duration ?? "");
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : 0;
}

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
  let goAwayTimer: ReturnType<typeof setTimeout> | undefined;
  let silenceTimer: ReturnType<typeof setTimeout> | undefined;
  let goodbyeTimer: ReturnType<typeof setTimeout> | undefined;
  let wrapUpTimer: ReturnType<typeof setTimeout> | undefined;
  let limitTimer: ReturnType<typeof setTimeout> | undefined;
  let active = false;
  let runId = 0;
  let link = 0;
  let callState = initialSessionState;
  let nudged = false;
  let closing = false;
  let resumeHandle: string | undefined;
  let resuming = false;
  let resumes = 0;
  let muted = false;
  let transcript: TranscriptEntry[] = [];
  let toolEvents: ToolEvent[] = [];
  const cancelled = new Set<string>();

  const setTranscript = (next: TranscriptEntry[]) => {
    transcript = next;
    handlers.onTranscript(next);
  };

  const sendText = (text: string) =>
    session?.sendClientContent({ turns: [{ role: "user", parts: [{ text }] }], turnComplete: true });

  const teardown = () => {
    for (const timer of [pauseTimer, goAwayTimer, silenceTimer, goodbyeTimer, wrapUpTimer, limitTimer]) clearTimeout(timer);
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
    emit(event);
    handlers.onFinished({ transcript, toolEvents });
  };

  const end = () => finish({ type: "END" });
  const fail = (message: string) => finish({ type: "ERROR", message });

  const onSilence = () => {
    if (!nudged) {
      nudged = true;
      sendText(STILL_THERE);
      return;
    }
    closing = true;
    sendText(GOODBYE);
    goodbyeTimer = setTimeout(end, GOODBYE_GRACE_MS);
  };

  // Silence is counted only while Aria is waiting for the customer.
  const watchSilence = (event: SessionEvent) => {
    clearTimeout(silenceTimer);
    if (!active) return;
    if (event.type === "USER_TRANSCRIPT") {
      nudged = false;
      closing = false;
      clearTimeout(goodbyeTimer);
      return;
    }
    if (muted || callState.status !== "listening") return;
    if (closing) return end();
    silenceTimer = setTimeout(onSilence, SILENCE_MS);
  };

  // The transcript arrives late, so mic loudness is what tells us the customer is talking.
  const heardCustomer = () => {
    if (!active || callState.status !== "listening" || closing) return;
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(onSilence, SILENCE_MS);
  };

  // Muted: keep the mic open but send nothing, and don't treat the quiet as the customer leaving.
  const setMuted = (next: boolean) => {
    if (next === muted) return;
    muted = next;
    if (muted) {
      clearTimeout(silenceTimer);
      session?.sendRealtimeInput({ audioStreamEnd: true });
    } else {
      heardCustomer();
    }
  };

  function emit(event: SessionEvent) {
    callState = sessionReducer(callState, event);
    handlers.onEvent(event);
    watchSilence(event);
  }

  async function runTools(calls: FunctionCall[]) {
    emit({ type: "TOOL_CALL" });
    const responses: FunctionResponse[] = await Promise.all(
      calls.map(async (call) => {
        const name = call.name ?? "";
        const args = (call.args ?? {}) as Record<string, unknown>;
        // One ticket per call: a repeat escalation gets the ticket already opened.
        const existing = name === "escalate_to_human" ? findEscalation(toolEvents) : undefined;
        let result: Record<string, unknown>;
        try {
          result = (existing ?? (await callTool(name, args, AbortSignal.timeout(TOOL_TIMEOUT_MS)))) as Record<string, unknown>;
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
        setTranscript(closeTurn(transcript));
        emit({ type: "INTERRUPTED" });
      }
      const userText = content.inputTranscription?.text;
      if (userText) {
        setTranscript(appendTranscript(transcript, "customer", userText, Date.now()));
        emit({ type: "USER_TRANSCRIPT" });
        clearTimeout(pauseTimer);
        pauseTimer = setTimeout(() => emit({ type: "USER_PAUSE" }), USER_PAUSE_MS);
      }
      const agentText = content.outputTranscription?.text;
      if (agentText) setTranscript(appendTranscript(transcript, "agent", agentText, Date.now()));
      for (const part of content.modelTurn?.parts ?? []) {
        const data = part.inlineData?.data;
        if (data && part.inlineData?.mimeType?.startsWith("audio/")) {
          player?.enqueue(data);
          emit({ type: "AUDIO_CHUNK" });
        }
      }
      if (content.turnComplete) {
        setTranscript(closeTurn(transcript));
        emit({ type: "TURN_COMPLETE" });
      }
    }
    for (const id of message.toolCallCancellation?.ids ?? []) cancelled.add(id);
    if (message.toolCall?.functionCalls?.length) void runTools(message.toolCall.functionCalls);
    const update = message.sessionResumptionUpdate;
    if (update?.resumable && update.newHandle) resumeHandle = update.newHandle;
    if (message.goAway) {
      clearTimeout(goAwayTimer);
      if (resumeHandle) void resume(runId);
      else goAwayTimer = setTimeout(end, parseDurationMs(message.goAway.timeLeft));
    }
  }

  // Opens a Live session and makes it the current one. The previous session, if any, is closed.
  async function connect(run: number, handle?: string): Promise<boolean> {
    const { token, model } = await getToken(handle);
    if (run !== runId || !active) return false;
    const id = link + 1;
    const current = () => run === runId && id === link;
    const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: "v1alpha" } });
    const connected = await ai.live.connect({
      model,
      callbacks: {
        onmessage: (message) => {
          if (current()) handleMessage(message);
        },
        onerror: () => {
          if (current()) dropped("The call connection failed. Please try again.");
        },
        onclose: (event) => {
          if (current() && active) dropped(event.reason ? `Call disconnected: ${event.reason}` : "The call was disconnected.");
        },
      },
    });
    if (run !== runId || !active) {
      connected.close();
      return false;
    }
    const previous = session;
    link = id;
    session = connected;
    previous?.close();
    return true;
  }

  function dropped(message: string) {
    if (resuming) return;
    if (!resumeHandle || resumes >= MAX_RESUMES) return fail(message);
    // The socket is gone, so stop sending to it until the resumed session takes over.
    session = null;
    void resume(runId);
  }

  async function resume(run: number) {
    if (resuming || !resumeHandle) return;
    resuming = true;
    resumes += 1;
    try {
      await connect(run, resumeHandle);
    } catch {
      if (run === runId) fail("The call was disconnected.");
    } finally {
      resuming = false;
    }
  }

  async function start() {
    if (active) return;
    const run = ++runId;
    const stale = () => run !== runId || !active;
    active = true;
    callState = initialSessionState;
    nudged = false;
    closing = false;
    resumeHandle = undefined;
    resuming = false;
    resumes = 0;
    muted = false;
    transcript = [];
    toolEvents = [];
    cancelled.clear();
    handlers.onTranscript([]);
    handlers.onToolEvents([]);
    emit({ type: "START" });

    try {
      const runPlayer = await createAudioPlayer(() => {
        if (run === runId) emit({ type: "PLAYBACK_DRAINED" });
      });
      if (stale()) return runPlayer.close();
      player = runPlayer;
      const runMic = await startMicRecorder((data, level) => {
        if (run !== runId || muted) return;
        if (level >= SPEECH_LEVEL) heardCustomer();
        session?.sendRealtimeInput({ audio: { data, mimeType: "audio/pcm;rate=16000" } });
      });
      if (stale()) return runMic.stop();
      mic = runMic;
      if (!(await connect(run))) return;
      emit({ type: "OPEN" });
      wrapUpTimer = setTimeout(() => sendText(WRAP_UP), CALL_LIMIT_MS - WRAP_UP_BEFORE_MS);
      limitTimer = setTimeout(end, CALL_LIMIT_MS);
      sendText(GREETING_TRIGGER);
    } catch (error) {
      if (run === runId) fail(startErrorMessage(error));
    }
  }

  const dispose = () => {
    active = false;
    teardown();
  };

  return { start, end, dispose, setMuted };
}
