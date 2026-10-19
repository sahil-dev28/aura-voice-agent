export const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60_000;

// Failed attempts per caller and order, so the public tool API can't be used to guess the digits.
const failures = new Map<string, number[]>();

const recent = (key: string, now: Date) =>
  (failures.get(key) ?? []).filter((at) => now.getTime() - at < WINDOW_MS);

export function recordFailure(key: string, now: Date): void {
  failures.set(key, [...recent(key, now), now.getTime()]);
}

export const isLocked = (key: string, now: Date): boolean => recent(key, now).length >= MAX_FAILURES;
