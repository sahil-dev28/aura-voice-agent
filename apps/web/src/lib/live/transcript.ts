import type { TranscriptEntry, TranscriptRole } from "@/lib/types";

let counter = 0;
const nextId = (role: TranscriptRole) => `${role}-${Date.now()}-${counter++}`;

export function appendTranscript(
  entries: TranscriptEntry[],
  role: "customer" | "agent",
  chunk: string,
  ts: number,
): TranscriptEntry[] {
  if (!chunk) return entries;
  const last = entries.at(-1);
  if (last && last.role === role) {
    return [...entries.slice(0, -1), { ...last, text: last.text + chunk }];
  }
  return [...entries, { id: nextId(role), role, text: chunk, ts }];
}

export function addToolEntry(entries: TranscriptEntry[], text: string, ts: number): TranscriptEntry[] {
  return [...entries, { id: nextId("tool"), role: "tool", text, ts }];
}

export function toSummaryTranscript(entries: TranscriptEntry[]) {
  return entries
    .map((entry) => ({ role: entry.role, text: entry.text.trim(), ts: entry.ts }))
    .filter((entry) => entry.text.length > 0);
}

export const hasCustomerSpeech = (entries: TranscriptEntry[]) =>
  entries.some((entry) => entry.role === "customer" && entry.text.trim().length > 0);
