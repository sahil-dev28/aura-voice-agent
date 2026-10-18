import { cn } from "@aura/ui/lib/utils";

import type { CallStatus } from "@/lib/live/sessionReducer";

const STATES: Record<CallStatus, { label: string; dot: string; pulse?: boolean }> = {
  idle: { label: "Ready to call", dot: "bg-muted-foreground" },
  connecting: { label: "Connecting…", dot: "bg-amber-500", pulse: true },
  listening: { label: "Listening", dot: "bg-emerald-500", pulse: true },
  thinking: { label: "Thinking", dot: "bg-sky-500", pulse: true },
  speaking: { label: "Speaking", dot: "bg-violet-500", pulse: true },
  ended: { label: "Call ended", dot: "bg-muted-foreground" },
  error: { label: "Something went wrong", dot: "bg-destructive" },
};

export function StateIndicator({ status }: { status: CallStatus }) {
  const s = STATES[status];
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-lg border px-4 py-3">
      <span className="relative flex size-3">
        {s.pulse && <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-60", s.dot)} />}
        <span className={cn("relative inline-flex size-3 rounded-full", s.dot)} />
      </span>
      <span className="font-medium text-sm">{s.label}</span>
    </div>
  );
}
