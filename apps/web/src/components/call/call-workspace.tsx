"use client";

import { useEffect } from "react";
import { toast } from "sonner";

import { Card, CardContent } from "@aura/ui/components/card";

import { CallControls } from "@/components/call/call-controls";
import { CallMetricsCard } from "@/components/call/call-metrics";
import { CallSummary } from "@/components/call/call-summary";
import { LiveTranscript } from "@/components/call/live-transcript";
import { MessageBox } from "@/components/call/message-box";
import { PhotoUploadCard } from "@/components/call/photo-upload-card";
import { TestOrdersCard } from "@/components/call/test-orders-card";
import { TrySaying } from "@/components/call/try-saying";
import { VoiceOrb } from "@/components/call/voice-orb";
import { isLive } from "@/lib/live/sessionReducer";
import { findReplacement } from "@/lib/live/toolEvents";
import { useLiveSession } from "@/lib/live/use-live-session";

export function CallWorkspace() {
  const {
    state,
    transcript,
    toolEvents,
    summary,
    muted,
    inputMode,
    metrics,
    start,
    end,
    toggleMute,
    notePhotos,
    setBusy,
    sendTyped,
    noteTyping,
    levels,
    retrySummary,
  } = useLiveSession();
  const live = isLive(state.status);
  const replacement = findReplacement(toolEvents);

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state.error]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      {/* On wide screens the call stays in view while the sidebar scrolls. */}
      <div className="flex flex-col gap-6 lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div className="aura-stage flex flex-col items-center gap-4 rounded-xl px-4 pt-6 pb-5">
              <VoiceOrb status={state.status} levels={levels} />
              <CallControls
                status={state.status}
                muted={muted}
                canMute={inputMode === "voice"}
                onStart={start}
                onEnd={end}
                onToggleMute={toggleMute}
              />
            </div>
            {state.status === "error" && state.error && <p className="text-destructive text-sm">{state.error}</p>}
            <LiveTranscript entries={transcript} />
            {live && (
              <MessageBox typingOnly={inputMode === "text"} onSend={sendTyped} onTyping={noteTyping} />
            )}
          </CardContent>
        </Card>
        {replacement && (
          <PhotoUploadCard
            key={replacement.referenceId}
            referenceId={replacement.referenceId}
            maxPhotos={replacement.maxPhotos}
            photoCount={replacement.photoCount}
            onUploaded={notePhotos}
            onBusy={setBusy}
          />
        )}
        <CallSummary summary={summary} onRetry={retrySummary} />
        {metrics && <CallMetricsCard metrics={metrics} />}
      </div>
      <div className="flex flex-col gap-6">
        <TrySaying live={live} onSend={sendTyped} />
        <TestOrdersCard />
      </div>
    </div>
  );
}
