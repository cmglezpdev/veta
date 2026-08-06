import { describe, expect, it } from "vitest";
import { VetaError } from "../errors/veta-error.ts";
import {
  createRunRecord,
  parseRunRecord,
  type RunRecord,
  type RunSummary,
  type StepStatus,
  withStep,
} from "./run-record.ts";
import { STEP_ORDER } from "./steps.ts";

const VALID_STATUSES: readonly StepStatus[] = ["pending", "complete", "skipped"];

function freshRecord(overrides: Partial<RunRecord> = {}): RunRecord {
  return createRunRecord({
    externalId: "abc12345678",
    dirName: "sample-video",
    selectedTrack: null,
    ...overrides,
  });
}

describe("createRunRecord", () => {
  it("initializes every step as pending", () => {
    const record = freshRecord();
    for (const step of STEP_ORDER) {
      expect(record.steps[step]).toBe("pending");
    }
  });

  it("pins schemaVersion to 1", () => {
    expect(freshRecord().schemaVersion).toBe(1);
  });
});

describe("RunRecord step statuses", () => {
  it("accepts only pending, complete, or skipped", () => {
    const record = freshRecord({
      steps: {
        metadata_fetched: "complete",
        thumbnail_downloaded: "skipped",
        captions_downloaded: "pending",
        transcript_normalized: "complete",
        prompt_generated: "skipped",
      },
    });

    for (const step of STEP_ORDER) {
      expect(VALID_STATUSES).toContain(record.steps[step]);
    }
  });
});

describe("withStep", () => {
  it("marks the named step and leaves the others alone", () => {
    const record = freshRecord({ createdAt: "2026-01-01T00:00:00.000Z" });

    const advanced = withStep(record, "captions_downloaded", "complete", "2026-01-02T00:00:00.000Z");

    expect(advanced.steps.captions_downloaded).toBe("complete");
    expect(advanced.steps.metadata_fetched).toBe("pending");
    expect(advanced.steps.transcript_normalized).toBe("pending");
  });

  it("moves updatedAt forward without disturbing createdAt", () => {
    const record = freshRecord({ createdAt: "2026-01-01T00:00:00.000Z" });

    const advanced = withStep(record, "metadata_fetched", "complete", "2026-01-02T00:00:00.000Z");

    expect(advanced.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(advanced.updatedAt).toBe("2026-01-02T00:00:00.000Z");
  });

  it("returns a new record rather than mutating the one it was given", () => {
    const record = freshRecord({ createdAt: "2026-01-01T00:00:00.000Z" });

    withStep(record, "metadata_fetched", "complete", "2026-01-02T00:00:00.000Z");

    expect(record.steps.metadata_fetched).toBe("pending");
    expect(record.updatedAt).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("parseRunRecord", () => {
  it("round-trips a valid run record", () => {
    const original = freshRecord({
      steps: {
        metadata_fetched: "complete",
        thumbnail_downloaded: "skipped",
        captions_downloaded: "pending",
        transcript_normalized: "complete",
        prompt_generated: "skipped",
      },
      selectedTrack: "en-orig",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });

    const parsed = parseRunRecord(JSON.parse(JSON.stringify(original)));
    expect(parsed).toEqual(original);
  });

  it("rejects in_progress as a step status", () => {
    const payload = {
      schemaVersion: 1,
      externalId: "abc12345678",
      dirName: "sample-video",
      selectedTrack: null,
      steps: Object.fromEntries(STEP_ORDER.map((step) => [step, "pending"])),
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    (payload.steps as Record<string, string>).metadata_fetched = "in_progress";

    expect(() => parseRunRecord(payload)).toThrow(VetaError);
    try {
      parseRunRecord(payload);
    } catch (error) {
      expect(error).toBeInstanceOf(VetaError);
      expect((error as VetaError).code).toBe("PAYLOAD_SHAPE_CHANGED");
    }
  });

  it("rejects unknown schemaVersion", () => {
    const payload = parseRunRecord(freshRecord());
    const unknown = { ...payload, schemaVersion: 99 };

    expect(() => parseRunRecord(unknown)).toThrow(VetaError);
  });
});

describe("RunSummary", () => {
  it("carries list-view fields without full step state", () => {
    const summary: RunSummary = {
      externalId: "abc12345678",
      dirName: "sample-video",
      updatedAt: "2026-01-02T00:00:00.000Z",
    };

    expect(summary.externalId).toBe("abc12345678");
    expect(summary.dirName).toBe("sample-video");
    expect(summary.updatedAt).toBe("2026-01-02T00:00:00.000Z");
  });
});
