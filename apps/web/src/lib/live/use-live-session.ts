"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { getSummary, sendMetrics } from "@/lib/api";
import { createLiveCall } from "@/lib/live/live-call";
import type { CallMetrics } from "@/lib/live/metrics";
import { initialSessionState, sessionReducer } from "@/lib/live/sessionReducer";
import { hasCustomerSpeech, toSummaryTranscript } from "@/lib/live/transcript";
import type { SummaryState, ToolEvent, TranscriptEntry } from "@/lib/types";

type FinishedCall = { transcript: TranscriptEntry[]; toolEvents: ToolEvent[] };

async function requestSummary(call: FinishedCall, setSummary: (state: SummaryState) => void) {
  if (!hasCustomerSpeech(call.transcript)) {
    setSummary({ status: "empty" });
    return;
  }
  setSummary({ status: "loading" });
  try {
    const outcome = await getSummary({
      transcript: toSummaryTranscript(call.transcript),
      toolEvents: call.toolEvents.map(({ name, args, result }) => ({ name, args, result })),
    });
    setSummary({ status: "ready", outcome });
  } catch (error) {
    const message =
      error instanceof DOMException && error.name === "TimeoutError"
        ? "The summary is taking too long. Try again."
        : error instanceof Error
          ? error.message
          : "Could not generate summary";
    setSummary({ status: "error", message });
  }
}

export function useLiveSession() {
  const [state, dispatch] = useReducer(sessionReducer, initialSessionState);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([]);
  const [summary, setSummary] = useState<SummaryState>({ status: "idle" });
  const [muted, setMuted] = useState(false);
  const [inputMode, setInputMode] = useState<"voice" | "text">("voice");
  const [metrics, setMetrics] = useState<CallMetrics | null>(null);
  const lastCall = useRef<FinishedCall | null>(null);

  const [call] = useState(() =>
    createLiveCall({
      onEvent: dispatch,
      onTranscript: setTranscript,
      onToolEvents: setToolEvents,
      onInputMode: setInputMode,
      onFinished: (finished) => {
        lastCall.current = finished;
        setMuted(false);
        setMetrics(finished.metrics);
        // Telemetry is best effort: a failed send must never affect the call or the summary.
        sendMetrics(finished.metrics).catch(() => {});
        void requestSummary(finished, setSummary);
      },
    }),
  );

  useEffect(() => () => call.dispose(), [call]);

  const start = useCallback(() => {
    setSummary({ status: "idle" });
    setMuted(false);
    setMetrics(null);
    void call.start();
  }, [call]);

  const toggleMute = useCallback(() => {
    call.setMuted(!muted);
    setMuted(!muted);
  }, [call, muted]);

  const retrySummary = useCallback(() => {
    if (lastCall.current) void requestSummary(lastCall.current, setSummary);
  }, []);

  return {
    state,
    transcript,
    toolEvents,
    summary,
    muted,
    inputMode,
    metrics,
    start,
    end: call.end,
    toggleMute,
    notePhotos: call.notePhotos,
    setBusy: call.setBusy,
    sendTyped: call.sendTyped,
    noteTyping: call.noteTyping,
    levels: call.levels,
    retrySummary,
  };
}
