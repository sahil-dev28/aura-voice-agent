export type OrderIdResult = { ok: true; orderId: string } | { ok: false };

const DIGIT_WORDS: Record<string, string> = {
  zero: "0",
  oh: "0",
  o: "0",
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
const REPEAT_WORDS: Record<string, number> = { double: 2, triple: 3 };
const PREFIX_WORDS = new Set(["ord", "order", "number", "no", "id"]);

function toDigit(word: string | undefined): string | undefined {
  if (word === undefined) return undefined;
  if (/^\d$/.test(word)) return word;
  return DIGIT_WORDS[word];
}

function wordsToDigits(words: string[]): string | null {
  let out = "";
  for (let i = 0; i < words.length; i++) {
    const word = words[i] as string;
    if (/^\d+$/.test(word)) {
      out += word;
      continue;
    }
    const repeat = REPEAT_WORDS[word];
    if (repeat) {
      const digit = toDigit(words[i + 1]);
      if (!digit) return null;
      out += digit.repeat(repeat);
      i++;
      continue;
    }
    const digit = DIGIT_WORDS[word];
    if (digit === undefined) return null;
    out += digit;
  }
  return out || null;
}

function hundredForm(words: string[]): string | null {
  if (words[1] !== "hundred") return null;
  const head = toDigit(words[0]);
  if (!head) return null;
  const rest = words.slice(2).filter((word) => word !== "and");
  if (rest.length === 0) return `${head}00`;
  const tail = wordsToDigits(rest);
  if (!tail || tail.length > 2) return null;
  return head + tail.padStart(2, "0");
}

export function normalizeOrderId(raw: string): OrderIdResult {
  const words = raw
    .toLowerCase()
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  const lettersJoined = words.slice(0, 3).join("");
  const body = lettersJoined === "ord" ? words.slice(3) : words.filter((word) => !PREFIX_WORDS.has(word));
  if (body.length === 0) return { ok: false };

  const digits = hundredForm(body) ?? wordsToDigits(body);
  if (!digits || digits.length < 3 || digits.length > 6) return { ok: false };
  return { ok: true, orderId: `ORD-${digits}` };
}
