"use client";

import { useEffect, useRef } from "react";

import { ScrollArea } from "@aura/ui/components/scroll-area";
import { cn } from "@aura/ui/lib/utils";

import { formatSpokenIds } from "@/lib/live/transcript";
import type { TranscriptEntry } from "@/lib/types";

export function LiveTranscript({ entries }: { entries: TranscriptEntry[] }) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [entries]);

  return (
    // Compact until the call starts, so an empty box doesn't dominate the card.
    <ScrollArea className={cn("rounded-lg border", entries.length > 0 ? "h-[420px]" : "h-auto")}>
      <div className="flex flex-col gap-3 p-4">
        {entries.length === 0 && (
          <p className="text-muted-foreground text-sm">The conversation will appear here once the call starts.</p>
        )}
        {entries.map((entry) =>
          entry.role === "tool" ? (
            <p
              key={entry.id}
              className="self-center rounded-full bg-muted px-3 py-1 font-mono text-muted-foreground text-xs"
            >
              {entry.text}
            </p>
          ) : (
            <div
              key={entry.id}
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-2 text-sm",
                entry.role === "customer" ? "self-end bg-primary text-primary-foreground" : "self-start bg-muted",
              )}
            >
              <span className="mb-0.5 block font-medium text-xs opacity-70">
                {entry.role === "customer" ? "You" : "Aria"}
              </span>
              {formatSpokenIds(entry.text.trim())}
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>
    </ScrollArea>
  );
}
