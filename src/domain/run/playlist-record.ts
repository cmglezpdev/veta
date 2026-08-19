import { VetaError } from "../errors/veta-error.ts";
import { asNumber, asString, isRecord } from "../json.ts";
import type { StepStatus } from "./steps.ts";

/**
 * A playlist's own step order, separate from {@link STEP_ORDER} (single-video).
 *
 * Members are extracted through the unmodified single-video pipeline; this
 * order only tracks the playlist-level milestones around that loop.
 */
export const PLAYLIST_STEP_ORDER = ["members_resolved", "members_extracted", "prompt_generated"] as const;

export type PlaylistStepName = (typeof PLAYLIST_STEP_ORDER)[number];

export type MemberStatus = "pending" | "extracted" | "failed" | "unavailable" | "excluded";

const VALID_MEMBER_STATUSES: readonly MemberStatus[] = [
  "pending",
  "extracted",
  "failed",
  "unavailable",
  "excluded",
];

const VALID_STEP_STATUSES: readonly StepStatus[] = ["pending", "complete", "skipped"];

export interface PlaylistMemberRecord {
  /** 1-based ORIGINAL playlist position — never renumbered by curation. */
  readonly position: number;
  readonly externalId: string | null;
  readonly dirName: string | null;
  readonly status: MemberStatus;
  readonly errorCode: string | null;
}

export interface PlaylistRecord {
  readonly schemaVersion: 1;
  readonly kind: "playlist";
  readonly playlistId: string;
  readonly dirName: string;
  readonly title: string;
  /** Entries listed, BEFORE curation — drives the `NN-` prefix width. */
  readonly totalCount: number;
  readonly members: readonly PlaylistMemberRecord[];
  readonly steps: Readonly<Record<PlaylistStepName, StepStatus>>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreatePlaylistRecordInput {
  readonly playlistId: string;
  readonly dirName: string;
  readonly title: string;
  readonly totalCount: number;
  readonly members: readonly PlaylistMemberRecord[];
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly steps?: Partial<Record<PlaylistStepName, StepStatus>>;
}

/**
 * Mint a new playlist record with every step pending unless overridden.
 */
export function createPlaylistRecord(input: CreatePlaylistRecordInput): PlaylistRecord {
  const timestamp = input.createdAt ?? input.updatedAt ?? "1970-01-01T00:00:00.000Z";
  const steps = {} as Record<PlaylistStepName, StepStatus>;

  for (const step of PLAYLIST_STEP_ORDER) {
    steps[step] = input.steps?.[step] ?? "pending";
  }

  return {
    schemaVersion: 1,
    kind: "playlist",
    playlistId: input.playlistId,
    dirName: input.dirName,
    title: input.title,
    totalCount: input.totalCount,
    members: input.members,
    steps,
    createdAt: input.createdAt ?? timestamp,
    updatedAt: input.updatedAt ?? timestamp,
  };
}

function parseMemberRecord(value: unknown): PlaylistMemberRecord {
  if (!isRecord(value)) {
    throw new VetaError("PAYLOAD_SHAPE_CHANGED", "Playlist member record must be a JSON object.");
  }

  const position = asNumber(value.position);
  if (position === null) {
    throw new VetaError("PAYLOAD_SHAPE_CHANGED", "Playlist member record is missing position.");
  }

  const status = value.status;
  if (typeof status !== "string" || !VALID_MEMBER_STATUSES.includes(status as MemberStatus)) {
    throw new VetaError("PAYLOAD_SHAPE_CHANGED", "Playlist member record has an unknown status.");
  }

  const externalIdRaw = value.externalId;
  const externalId = externalIdRaw === null ? null : asString(externalIdRaw);
  if (externalIdRaw !== null && externalId === null) {
    throw new VetaError(
      "PAYLOAD_SHAPE_CHANGED",
      "Playlist member record externalId must be a string or null.",
    );
  }

  const dirNameRaw = value.dirName;
  const dirName = dirNameRaw === null ? null : asString(dirNameRaw);
  if (dirNameRaw !== null && dirName === null) {
    throw new VetaError("PAYLOAD_SHAPE_CHANGED", "Playlist member record dirName must be a string or null.");
  }

  const errorCodeRaw = value.errorCode;
  const errorCode = errorCodeRaw === null ? null : asString(errorCodeRaw);
  if (errorCodeRaw !== null && errorCode === null) {
    throw new VetaError(
      "PAYLOAD_SHAPE_CHANGED",
      "Playlist member record errorCode must be a string or null.",
    );
  }

  return { position, externalId, dirName, status: status as MemberStatus, errorCode };
}

/**
 * Parse persisted playlist state from untrusted JSON.
 *
 * @throws VetaError `PAYLOAD_SHAPE_CHANGED` when the payload is not v1 playlist shape.
 */
export function parsePlaylistRecord(value: unknown): PlaylistRecord {
  if (!isRecord(value)) {
    throw new VetaError("PAYLOAD_SHAPE_CHANGED", "Playlist record must be a JSON object.");
  }

  if (value.schemaVersion !== 1) {
    throw new VetaError("PAYLOAD_SHAPE_CHANGED", "Playlist record schemaVersion must be 1.");
  }

  if (value.kind !== "playlist") {
    throw new VetaError("PAYLOAD_SHAPE_CHANGED", 'Playlist record kind must be "playlist".');
  }

  const playlistId = asString(value.playlistId);
  const dirName = asString(value.dirName);
  const title = asString(value.title);
  const createdAt = asString(value.createdAt);
  const updatedAt = asString(value.updatedAt);
  const totalCount = asNumber(value.totalCount);

  if (
    playlistId === null ||
    dirName === null ||
    title === null ||
    createdAt === null ||
    updatedAt === null ||
    totalCount === null
  ) {
    throw new VetaError("PAYLOAD_SHAPE_CHANGED", "Playlist record is missing required fields.");
  }

  if (!Array.isArray(value.members)) {
    throw new VetaError("PAYLOAD_SHAPE_CHANGED", "Playlist record members must be an array.");
  }
  const members = value.members.map(parseMemberRecord);

  if (!isRecord(value.steps)) {
    throw new VetaError("PAYLOAD_SHAPE_CHANGED", "Playlist record steps must be an object.");
  }

  const steps = {} as Record<PlaylistStepName, StepStatus>;
  for (const step of PLAYLIST_STEP_ORDER) {
    const status = value.steps[step];
    if (typeof status !== "string" || !VALID_STEP_STATUSES.includes(status as StepStatus)) {
      throw new VetaError(
        "PAYLOAD_SHAPE_CHANGED",
        `Playlist record step ${step} must be pending, complete, or skipped.`,
      );
    }
    steps[step] = status as StepStatus;
  }

  return {
    schemaVersion: 1,
    kind: "playlist",
    playlistId,
    dirName,
    title,
    totalCount,
    members,
    steps,
    createdAt,
    updatedAt,
  };
}
