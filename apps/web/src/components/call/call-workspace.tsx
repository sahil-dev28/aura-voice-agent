"use client";

import { useEffect } from "react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@aura/ui/components/card";

import { CallControls } from "@/components/call/call-controls";
import { CallSummary } from "@/components/call/call-summary";
import { LiveTranscript } from "@/components/call/live-transcript";
import { StateIndicator } from "@/components/call/state-indicator";
import { TestOrdersCard } from "@/components/call/test-orders-card";
import { useLiveSession } from "@/lib/live/use-live-session";

export function CallWorkspace() {
  const { state, transcript, summary, start, end, retrySummary } = useLiveSession();

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state.error]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Call Aria</CardTitle>
            <CardDescription>
              Allow microphone access when asked. Speak naturally; you can interrupt Aria at any time.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <CallControls status={state.status} onStart={start} onEnd={end} />
              <div className="flex-1">
                <StateIndicator status={state.status} />
              </div>
            </div>
            {state.status === "error" && state.error && <p className="text-destructive text-sm">{state.error}</p>}
            <LiveTranscript entries={transcript} />
          </CardContent>
        </Card>
        <CallSummary summary={summary} onRetry={retrySummary} />
      </div>
      <TestOrdersCard />
    </div>
  );
}
