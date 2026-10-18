"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { getSummary } from "@/lib/api";
import { createLiveCall } from "@/lib/live/live-call";
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
    setSummary({ status: "error", message: error instanceof Error ? error.message : "Could not generate summary" });
  }
}

export function useLiveSession() {
  const [state, dispatch] = useReducer(sessionReducer, initialSessionState);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([]);
  const [summary, setSummary] = useState<SummaryState>({ status: "idle" });
  const lastCall = useRef<FinishedCall | null>(null);

  const [call] = useState(() =>
    createLiveCall({
      onEvent: dispatch,
      onTranscript: setTranscript,
      onToolEvents: setToolEvents,
      onFinished: (finished) => {
        lastCall.current = finished;
        void requestSummary(finished, setSummary);
      },
    }),
  );

  useEffect(() => () => call.dispose(), [call]);

  const start = useCallback(() => {
    setSummary({ status: "idle" });
    void call.start();
  }, [call]);

  const retrySummary = useCallback(() => {
    if (lastCall.current) void requestSummary(lastCall.current, setSummary);
  }, []);

  return { state, transcript, toolEvents, summary, start, end: call.end, retrySummary };
}
