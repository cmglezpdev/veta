import { VetaError } from "../errors/veta-error.ts";
import { asString, isRecord } from "../json.ts";
import { STEP_ORDER, type StepName, type StepStatus } from "./steps.ts";

export type { StepStatus };

export interface RunRecord {
  readonly schemaVersion: 1;
  readonly externalId: string;
  readonly dirName: string;
  readonly selectedTrack: string | null;
  readonly steps: Readonly<Record<StepName, StepStatus>>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RunSummary {
  readonly externalId: string;
  readonly dirName: string;
  readonly updatedAt: string;
}

const VALID_STEP_STATUSES: readonly StepStatus[] = ["pending", "complete", "skipped"];

export interface CreateRunRecordInput {
  readonly externalId: string;
  readonly dirName: string;
  readonly selectedTrack: string | null;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly steps?: Partial<Record<StepName, StepStatus>>;
}

/**
 * Mint a new run record with every step pending unless overridden.
 */
export function createRunRecord(input: CreateRunRecordInput): RunRecord {
  const timestamp = input.createdAt ?? input.updatedAt ?? "1970-01-01T00:00:00.000Z";
  const steps = {} as Record<StepName, StepStatus>;

  for (const step of STEP_ORDER) {
    steps[step] = input.steps?.[step] ?? "pending";
  }

  return {
    schemaVersion: 1,
    externalId: input.externalId,
    dirName: input.dirName,
    selectedTrack: input.selectedTrack,
    steps,
    createdAt: input.createdAt ?? timestamp,
    updatedAt: input.updatedAt ?? timestamp,
  };
}

/**
 * Record that one step reached a terminal status, as of `updatedAt`.
 *
 * The runner advances a record step by step and hands each version to the
 * store, so this stays pure and copying: the caller keeps the record it passed
 * in, which is what a failed save has to fall back on.
 */
export function withStep(
  record: RunRecord,
  step: StepName,
  status: StepStatus,
  updatedAt: string,
): RunRecord {
  return {
    ...record,
    steps: { ...record.steps, [step]: status },
    updatedAt,
  };
}

/**
 * Parse persisted run state from untrusted JSON.
 *
 * @throws VetaError `PAYLOAD_SHAPE_CHANGED` when the payload is not v1 shape.
 */
export function parseRunRecord(value: unknown): RunRecord {
  if (!isRecord(value)) {
    throw new VetaError("PAYLOAD_SHAPE_CHANGED", "Run record must be a JSON object.");
  }

  if (value.schemaVersion !== 1) {
    throw new VetaError("PAYLOAD_SHAPE_CHANGED", "Run record schemaVersion must be 1.");
  }

  const externalId = asString(value.externalId);
  const dirName = asString(value.dirName);
  const createdAt = asString(value.createdAt);
  const updatedAt = asString(value.updatedAt);

  if (externalId === null || dirName === null || createdAt === null || updatedAt === null) {
    throw new VetaError("PAYLOAD_SHAPE_CHANGED", "Run record is missing required fields.");
  }

  const selectedTrackRaw = value.selectedTrack;
  const selectedTrack =
    selectedTrackRaw === null ? null : asString(selectedTrackRaw);
  if (selectedTrackRaw !== null && selectedTrack === null) {
    throw new VetaError("PAYLOAD_SHAPE_CHANGED", "Run record selectedTrack must be a string or null.");
  }

  if (!isRecord(value.steps)) {
    throw new VetaError("PAYLOAD_SHAPE_CHANGED", "Run record steps must be an object.");
  }

  const steps = {} as Record<StepName, StepStatus>;
  for (const step of STEP_ORDER) {
    const status = value.steps[step];
    if (typeof status !== "string" || !VALID_STEP_STATUSES.includes(status as StepStatus)) {
      throw new VetaError(
        "PAYLOAD_SHAPE_CHANGED",
        `Run record step ${step} must be pending, complete, or skipped.`,
      );
    }
    steps[step] = status as StepStatus;
  }

  return {
    schemaVersion: 1,
    externalId,
    dirName,
    selectedTrack,
    steps,
    createdAt,
    updatedAt,
  };
}

/**
 * Derive an index entry from a full run record.
 */
export function toRunSummary(record: RunRecord): RunSummary {
  return {
    externalId: record.externalId,
    dirName: record.dirName,
    updatedAt: record.updatedAt,
  };
}
