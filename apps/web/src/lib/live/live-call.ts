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
import { type CallMetrics, createMetrics } from "@/lib/live/metrics";
import { type SessionEvent, initialSessionState, sessionReducer } from "@/lib/live/sessionReducer";
import { describeToolEvent, filterCancelled, findEscalation } from "@/lib/live/toolEvents";
import { addToolEntry, appendTranscript, closeTurn } from "@/lib/live/transcript";
import type { PhotoUpload, ToolEvent, TranscriptEntry } from "@/lib/types";

export type LiveCallHandlers = {
  onEvent: (event: SessionEvent) => void;
  onTranscript: (entries: TranscriptEntry[]) => void;
  onToolEvents: (events: ToolEvent[]) => void;
  onFinished: (call: { transcript: TranscriptEntry[]; toolEvents: ToolEvent[]; metrics: CallMetrics }) => void;
  onInputMode: (mode: "voice" | "text") => void;
};

const USER_PAUSE_MS = 700;
const TOOL_TIMEOUT_MS = 5000;
const GREETING_TRIGGER = "The customer has just joined the call. Greet them now.";
const TYPING_GREETING =
  "The customer has just joined the call. Their microphone is unavailable, so they will type their messages. Greet them now.";
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

const micUnavailable = (error: unknown) =>
  error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "NotFoundError");

function startErrorMessage(error: unknown): string {
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
  let busy = false;
  let micLevel = 0;
  let inputMode: CallMetrics["inputMode"] = "voice";
  let metrics = createMetrics();
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
    if (event.type === "ERROR") metrics.error(event.message);
    emit(event);
    handlers.onFinished({ transcript, toolEvents, metrics: metrics.finish(inputMode) });
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
    if (muted || busy || callState.status !== "listening") return;
    if (closing) return end();
    silenceTimer = setTimeout(onSilence, SILENCE_MS);
  };

  // The transcript arrives late, so mic loudness is what tells us the customer is talking.
  const heardCustomer = () => {
    if (!active || muted || busy || callState.status !== "listening" || closing) return;
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

  // Busy: the customer is doing something on the page (choosing photos), so quiet is expected.
  const setBusy = (next: boolean) => {
    busy = next;
    if (busy) clearTimeout(silenceTimer);
    else heardCustomer();
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
        const startedAt = Date.now();
        try {
          result = (existing ?? (await callTool(name, args, AbortSignal.timeout(TOOL_TIMEOUT_MS)))) as Record<string, unknown>;
        } catch (error) {
          result = { error: error instanceof ApiError && error.status < 500 ? error.message : "LOOKUP_UNAVAILABLE" };
        }
        const ts = Date.now();
        metrics.toolDone(name, ts - startedAt, !("error" in result));
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
        metrics.interrupted();
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
          metrics.agentAudio();
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
      if (await connect(run, resumeHandle)) metrics.reconnected();
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
    busy = false;
    micLevel = 0;
    metrics = createMetrics();
    metrics.started();
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
      // A blocked or missing mic doesn't end the call: the customer types instead.
      let runMic: MicRecorder | null = null;
      try {
        runMic = await startMicRecorder((data, level) => {
          if (run !== runId || muted) return;
          micLevel = level;
          if (level >= SPEECH_LEVEL) {
            heardCustomer();
            // Sound while Aria is talking is mostly echo, so it doesn't start a reply timer.
            if (callState.status !== "speaking") metrics.customerSpoke();
          }
          session?.sendRealtimeInput({ audio: { data, mimeType: "audio/pcm;rate=16000" } });
        });
      } catch (error) {
        if (!micUnavailable(error)) throw error;
      }
      if (stale()) return runMic?.stop();
      mic = runMic;
      inputMode = mic ? "voice" : "text";
      handlers.onInputMode(inputMode);
      if (!(await connect(run))) return;
      metrics.opened();
      emit({ type: "OPEN" });
      wrapUpTimer = setTimeout(() => sendText(WRAP_UP), CALL_LIMIT_MS - WRAP_UP_BEFORE_MS);
      limitTimer = setTimeout(end, CALL_LIMIT_MS);
      sendText(mic ? GREETING_TRIGGER : TYPING_GREETING);
    } catch (error) {
      if (run === runId) fail(startErrorMessage(error));
    }
  }

  const dispose = () => {
    active = false;
    teardown();
  };

  // Photos come from the page, not from a tool call, so they are logged like one for the transcript and summary.
  const notePhotos = (upload: PhotoUpload) => {
    if (!active) return;
    const ts = Date.now();
    toolEvents = [...toolEvents, { id: `photo_upload-${ts}`, name: "photo_upload", args: {}, result: upload, ts }];
    handlers.onToolEvents(toolEvents);
    setTranscript(addToolEntry(transcript, describeToolEvent("photo_upload", {}, upload), ts));
    const photos = `${upload.photoCount} ${upload.photoCount === 1 ? "photo" : "photos"}`;
    sendText(`Call system: The customer has now uploaded ${photos} of the damage for ${upload.referenceId}.`);
  };

  // Typed text is labelled so a customer can't pass it off as a "Call system:" instruction.
  const sendTyped = (raw: string) => {
    const text = raw.trim();
    if (!active || !session || !text) return;
    metrics.customerSpoke();
    setTranscript(closeTurn(appendTranscript(closeTurn(transcript), "customer", text, Date.now())));
    emit({ type: "USER_TRANSCRIPT" });
    emit({ type: "USER_PAUSE" });
    sendText(`Customer (typed): ${text}`);
  };

  // Read on every animation frame by the orb, so it stays out of React state.
  const levels = () =>
    active ? { agent: player?.level() ?? 0, mic: muted ? 0 : micLevel } : { agent: 0, mic: 0 };

  return { start, end, dispose, setMuted, setBusy, notePhotos, sendTyped, noteTyping: heardCustomer, levels };
}
