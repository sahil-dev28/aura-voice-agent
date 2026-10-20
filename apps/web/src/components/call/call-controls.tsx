import { Keyboard, Mic, MicOff, Phone, PhoneOff } from "lucide-react";

import { Button } from "@aura/ui/components/button";

import { type CallStatus, isLive } from "@/lib/live/sessionReducer";

type Props = {
  status: CallStatus;
  muted: boolean;
  canMute: boolean;
  onStart: () => void;
  onStartTyping: () => void;
  onEnd: () => void;
  onToggleMute: () => void;
};

export function CallControls({ status, muted, canMute, onStart, onStartTyping, onEnd, onToggleMute }: Props) {
  const inCall = status === "connecting" || isLive(status);
  if (!inCall) {
    return (
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
        <Button size="lg" onClick={onStart}>
          <Phone data-icon="inline-start" />
          {status === "idle" ? "Start Call" : "Start New Call"}
        </Button>
        <Button size="lg" variant="outline" onClick={onStartTyping}>
          <Keyboard data-icon="inline-start" />
          Start by typing
        </Button>
      </div>
    );
  }
  return (
    <div className="flex gap-2">
      {isLive(status) && canMute && (
        <Button size="lg" variant="outline" aria-pressed={muted} onClick={onToggleMute} className="flex-1 sm:flex-none">
          {muted ? <MicOff data-icon="inline-start" /> : <Mic data-icon="inline-start" />}
          {muted ? "Unmute" : "Mute"}
        </Button>
      )}
      <Button size="lg" variant="destructive" onClick={onEnd} className="flex-1 sm:flex-none">
        <PhoneOff data-icon="inline-start" />
        End Call
      </Button>
    </div>
  );
}
