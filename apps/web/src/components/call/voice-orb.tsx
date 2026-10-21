"use client";

import { useEffect, useRef } from "react";

import { type Levels, orbTarget, smooth } from "@/lib/live/orb";
import type { CallStatus } from "@/lib/live/sessionReducer";

const STATES: Record<CallStatus, { label: string; hint: string }> = {
  idle: { label: "Ready when you are", hint: "Allow microphone access when asked, or start by typing." },
  connecting: { label: "Connecting…", hint: "Allow the microphone if your browser asks" },
  listening: { label: "Listening", hint: "Go ahead, Aria is listening" },
  thinking: { label: "Thinking", hint: "Aria is working on it" },
  speaking: { label: "Aria is speaking", hint: "Speak any time to interrupt her" },
  ended: { label: "Call ended", hint: "Start a new call any time" },
  error: { label: "Something went wrong", hint: "Try starting the call again" },
};

// In a typing call there is no mic, so the prompts point at the message box instead.
const TYPING_STATES: Partial<Record<CallStatus, { label: string; hint: string }>> = {
  connecting: { label: "Connecting…", hint: "Setting up the line" },
  listening: { label: "Your turn", hint: "Type your message below" },
  speaking: { label: "Aria is speaking", hint: "She replies out loud, and her words appear below" },
};

type Props = { status: CallStatus; typing: boolean; levels: () => Levels };

export function VoiceOrb({ status, typing, levels }: Props) {
  const orbRef = useRef<HTMLDivElement>(null);
  const level = useRef(0);

  // The orb follows the audio every frame through a CSS variable, so React doesn't re-render 60 times a second.
  useEffect(() => {
    const orb = orbRef.current;
    if (!orb || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const tick = () => {
      level.current = smooth(level.current, orbTarget(status, levels()));
      orb.style.setProperty("--level", level.current.toFixed(3));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [status, levels]);

  const state = (typing && TYPING_STATES[status]) || STATES[status];
  return (
    <div className="flex flex-col items-center gap-5">
      <div ref={orbRef} className="aura-orb" data-state={status} aria-hidden="true">
        <div className="aura-orb__core" />
        <div className="aura-orb__ring" />
        <div className="aura-orb__ring" />
        <div className="aura-orb__ring" />
      </div>
      <div role="status" aria-live="polite" className="text-center">
        <p className="font-semibold text-base">{state.label}</p>
        <p className="text-muted-foreground text-sm">{state.hint}</p>
      </div>
    </div>
  );
}
