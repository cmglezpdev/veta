import type { VetaErrorCode } from "../domain/errors/veta-error.ts";
import { isVetaError } from "../domain/errors/veta-error.ts";

/**
 * Public process exit contract (NFR-16).
 *
 * Only the CLI knows these numbers; domain code stops at `VetaError.code`.
 */
export const EXIT_CODES = {
  YTDLP_NOT_FOUND: 5,
  EXTRACTION_DRIFT: 5,
  PAYLOAD_SHAPE_CHANGED: 5,
  VIDEO_UNAVAILABLE: 6,
  BOT_CHECK: 7,
  RATE_LIMITED: 7,
  NO_CAPTIONS: 3,
  LANGUAGE_UNAVAILABLE: 4,
  ROOT_OVERLAP: 8,
  PATH_ESCAPE: 8,
  WORK_DIR_EXISTS: 8,
  INPUT_UNRECOGNIZED: 2,
  // Playlist wiring lands in PR5; these two codes exist starting PR4 (task
  // 4.2), so the exhaustive Record needs them now to keep tsc green.
  PLAYLIST_EMPTY: 6,
  PLAYLIST_PARTIAL_FAILURE: 9,
} as const satisfies Record<VetaErrorCode, number>;

/** Map a thrown value to the exit status the CLI should use. */
export function exitCodeFor(error: unknown): number {
  if (isVetaError(error)) return EXIT_CODES[error.code];
  return 1;
}
