import type { CallStatus } from "@/lib/live/sessionReducer";

export type Levels = { agent: number; mic: number };

const clamp = (value: number, max: number) => Math.min(max, Math.max(0, value));

// How much the orb swells (0 to 1). Speech RMS sits around 0.05 to 0.25, so it's scaled up.
export function orbTarget(status: CallStatus, levels: Levels): number {
  if (status === "speaking") return clamp(levels.agent * 4, 1);
  if (status === "listening") return clamp(levels.mic * 3, 0.4);
  return 0;
}

export const smooth = (previous: number, target: number, rate = 0.25) => previous + (target - previous) * rate;
