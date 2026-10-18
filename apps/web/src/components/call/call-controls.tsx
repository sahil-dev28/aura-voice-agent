import { Phone, PhoneOff } from "lucide-react";

import { Button } from "@aura/ui/components/button";

import { type CallStatus, isLive } from "@/lib/live/sessionReducer";

type Props = { status: CallStatus; onStart: () => void; onEnd: () => void };

export function CallControls({ status, onStart, onEnd }: Props) {
  const inCall = status === "connecting" || isLive(status);
  return inCall ? (
    <Button size="lg" variant="destructive" onClick={onEnd} className="w-full sm:w-auto">
      <PhoneOff data-icon="inline-start" />
      End Call
    </Button>
  ) : (
    <Button size="lg" onClick={onStart} className="w-full sm:w-auto">
      <Phone data-icon="inline-start" />
      {status === "idle" ? "Start Call" : "Start New Call"}
    </Button>
  );
}
