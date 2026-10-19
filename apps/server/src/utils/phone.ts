import { wordsToDigits } from "@/utils/orderId";

// Customers read out the last four digits of their phone number, as digits or words.
export function lastFourDigits(raw: string): string | null {
  const words = raw.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  const digits = words.length ? wordsToDigits(words) : null;
  return digits && digits.length >= 4 ? digits.slice(-4) : null;
}
