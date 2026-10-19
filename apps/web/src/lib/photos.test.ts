import { describe, expect, it } from "vitest";

import { fitWithin } from "@/lib/photos";

describe("fitWithin", () => {
  it("scales a large landscape photo down to the longest side", () => {
    expect(fitWithin(4000, 3000, 1280)).toEqual({ width: 1280, height: 960 });
  });

  it("scales a portrait photo by its height", () => {
    expect(fitWithin(3000, 4000, 1280)).toEqual({ width: 960, height: 1280 });
  });

  it("leaves small photos alone", () => {
    expect(fitWithin(800, 600, 1280)).toEqual({ width: 800, height: 600 });
  });
});
