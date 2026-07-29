import { describe, expect, it } from "vitest";
import { isMonotonic } from "./cue.ts";
import type { CaptionCue } from "./cue.ts";

function cue(startMs: number, endMs: number): CaptionCue {
  return { startMs, endMs, text: "text" };
}

describe("isMonotonic", () => {
  it("accepts ordered, non-overlapping cues", () => {
    expect(isMonotonic([cue(0, 100), cue(200, 300), cue(300, 400)])).toBe(true);
  });

  it("accepts an empty stream and a single cue", () => {
    expect(isMonotonic([])).toBe(true);
    expect(isMonotonic([cue(500, 900)])).toBe(true);
  });

  it("rejects a cue that ends before it starts", () => {
    expect(isMonotonic([cue(300, 100)])).toBe(false);
  });

  it("rejects a cue that overlaps the one after it", () => {
    expect(isMonotonic([cue(0, 500), cue(300, 700)])).toBe(false);
  });

  it("treats a zero-length cue as valid", () => {
    expect(isMonotonic([cue(100, 100), cue(100, 200)])).toBe(true);
  });
});
