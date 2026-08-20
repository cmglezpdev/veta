import { VetaError } from "../errors/veta-error.ts";
import { isRecord } from "../json.ts";
import { parsePlaylistRecord, type PlaylistRecord } from "./playlist-record.ts";
import { parseRunRecord, type RunRecord } from "./run-record.ts";

/**
 * Every kind of package the store's flat top-level directory can hold (D2).
 *
 * `RunRecord` carries no `kind` field at all — absence of `kind` means video.
 * `PlaylistRecord` is the only shape with `kind: "playlist"`. This keeps
 * `run-record.ts` and every existing `state.json` on disk untouched.
 */
export type StoredRecord = RunRecord | PlaylistRecord;

/** Narrows a {@link StoredRecord} to a {@link PlaylistRecord}. */
export function isPlaylistRecord(record: StoredRecord): record is PlaylistRecord {
  return "kind" in record && record.kind === "playlist";
}

/**
 * Parse persisted state from untrusted JSON, dispatching on `kind`.
 *
 * A payload with `kind: "playlist"` goes to {@link parsePlaylistRecord}; every
 * other payload — including v1 video records that predate this field — goes
 * to {@link parseRunRecord} unchanged.
 *
 * @throws VetaError `PAYLOAD_SHAPE_CHANGED` when the payload matches neither shape.
 */
export function parseStoredRecord(value: unknown): StoredRecord {
  if (!isRecord(value)) {
    throw new VetaError("PAYLOAD_SHAPE_CHANGED", "Stored record must be a JSON object.");
  }

  return value.kind === "playlist" ? parsePlaylistRecord(value) : parseRunRecord(value);
}
