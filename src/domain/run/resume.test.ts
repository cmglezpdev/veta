import { describe, expect, it } from "vitest";
import { createRunRecord, type RunRecord } from "./run-record.ts";
import { firstIncompleteStep } from "./resume.ts";
import { STEP_ORDER, type StepName, type StepStatus } from "./steps.ts";

function recordWithSteps(steps: Partial<Record<StepName, StepStatus>>): RunRecord {
  const base = createRunRecord({
    externalId: "abc12345678",
    dirName: "sample-video",
    selectedTrack: null,
  });
  return {
    ...base,
    steps: { ...base.steps, ...steps },
  };
}

describe("firstIncompleteStep", () => {
  it("returns metadata_fetched when all steps are pending", () => {
    const record = recordWithSteps({});
    expect(firstIncompleteStep(record)).toBe("metadata_fetched");
  });

  it("returns captions_downloaded when steps 1–2 are complete and step 3 is pending", () => {
    const record = recordWithSteps({
      metadata_fetched: "complete",
      thumbnail_downloaded: "complete",
      captions_downloaded: "pending",
    });
    expect(firstIncompleteStep(record)).toBe("captions_downloaded");
  });

  it("treats skipped steps as terminal and continues to the next pending step", () => {
    const record = recordWithSteps({
      metadata_fetched: "complete",
      thumbnail_downloaded: "skipped",
      captions_downloaded: "pending",
    });
    expect(firstIncompleteStep(record)).toBe("captions_downloaded");
  });

  it("returns null when every step is complete or skipped", () => {
    const record = recordWithSteps({
      metadata_fetched: "complete",
      thumbnail_downloaded: "skipped",
      captions_downloaded: "complete",
      transcript_normalized: "complete",
      prompt_generated: "skipped",
    });
    expect(firstIncompleteStep(record)).toBeNull();
  });

  it("walks STEP_ORDER left to right", () => {
    for (let index = 0; index < STEP_ORDER.length; index += 1) {
      const steps = Object.fromEntries(
        STEP_ORDER.map((step, stepIndex) => [
          step,
          stepIndex < index ? "complete" : stepIndex === index ? "pending" : "pending",
        ]),
      ) as Record<StepName, StepStatus>;

      expect(firstIncompleteStep(recordWithSteps(steps))).toBe(STEP_ORDER[index]);
    }
  });
});
