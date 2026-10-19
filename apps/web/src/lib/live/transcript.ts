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
  if (last && last.role === role && !last.closed) {
    return [...entries.slice(0, -1), { ...last, text: last.text + chunk }];
  }
  return [...entries, { id: nextId(role), role, text: chunk, ts }];
}

export function closeTurn(entries: TranscriptEntry[]): TranscriptEntry[] {
  const last = entries.at(-1);
  if (!last || last.closed) return entries;
  return [...entries.slice(0, -1), { ...last, closed: true }];
}

const DIGITS: Record<string, string> = {
  zero: "0",
  oh: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
};
const DIGIT = "(?:[Zz]ero|[Oo]h|[Oo]ne|[Tt]wo|[Tt]hree|[Ff]our|[Ff]ive|[Ss]ix|[Ss]even|[Ee]ight|[Nn]ine|[0-9])";
const HEX = `(?:${DIGIT}|[A-F])`;
const SEP = "[\\s,-]*";
const spaced = (letters: string) => letters.split("").join(" ?");
// Aria reads IDs out letter by letter ("O R D one zero three"); this turns them back into "ORD-103".
const ORDER_ID = new RegExp(`\\b(${spaced("ORD")})${SEP}(${DIGIT}(?:${SEP}${DIGIT}){2})(?![A-Za-z0-9])`, "g");
const REFERENCE_ID = new RegExp(
  `\\b(${["ESC", "CXL", "RET", "RPL"].map(spaced).join("|")})${SEP}(${HEX}(?:${SEP}${HEX}){3})(?![A-Za-z0-9])`,
  "g",
);
const TOKEN = new RegExp(`${DIGIT}|[A-F]`, "g");

const writeId = (_match: string, prefix: string, rest: string) =>
  `${prefix.replaceAll(" ", "")}-${(rest.match(TOKEN) ?? []).map((token) => DIGITS[token.toLowerCase()] ?? token).join("")}`;

export const formatSpokenIds = (text: string): string =>
  text.replace(ORDER_ID, writeId).replace(REFERENCE_ID, writeId);

export function addToolEntry(entries: TranscriptEntry[], text: string, ts: number): TranscriptEntry[] {
  return [...entries, { id: nextId("tool"), role: "tool", text, ts }];
}

export function toSummaryTranscript(entries: TranscriptEntry[]) {
  return entries
    .map((entry) => ({ role: entry.role, text: formatSpokenIds(entry.text.trim()), ts: entry.ts }))
    .filter((entry) => entry.text.length > 0);
}

export const hasCustomerSpeech = (entries: TranscriptEntry[]) =>
  entries.some((entry) => entry.role === "customer" && entry.text.trim().length > 0);
