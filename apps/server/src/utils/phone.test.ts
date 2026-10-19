import { describe, expect, it } from "vitest";

import { lastFourDigits } from "@/utils/phone";

describe("lastFourDigits", () => {
  it.each([
    ["3721", "3721"],
    ["three seven two one", "3721"],
    ["Three, seven, two, one.", "3721"],
    ["+91 98201 43721", "3721"],
    ["double three seven one", "3371"],
    ["3 7 2 1", "3721"],
  ])("%s -> %s", (input, digits) => {
    expect(lastFourDigits(input)).toBe(digits);
  });

  it.each(["12", "banana", "", "three seven"])("rejects %j", (input) => {
    expect(lastFourDigits(input)).toBeNull();
  });
});
