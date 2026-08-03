import { describe, expect, it } from "vitest";
import { STEP_ORDER, type StepName } from "./steps.ts";

describe("STEP_ORDER", () => {
  it("lists all five extraction steps in fixed order", () => {
    const expected: readonly StepName[] = [
      "metadata_fetched",
      "thumbnail_downloaded",
      "captions_downloaded",
      "transcript_normalized",
      "prompt_generated",
    ];
    expect(STEP_ORDER).toEqual(expected);
  });

  it("contains exactly five steps with no duplicates", () => {
    expect(STEP_ORDER).toHaveLength(5);
    expect(new Set(STEP_ORDER).size).toBe(5);
  });
});
