/**
 * The failures veta knows how to explain.
 *
 * Every one of these is a situation a user can act on — a missing binary, a
 * private video, a language that does not exist. They are named here, in the
 * domain, because the domain is what decides that a situation has occurred.
 * Only `cli/` maps them to process exit codes, so nothing below the CLI has to
 * know that processes have exit codes at all.
 *
 * Anything NOT in this union is a bug in veta rather than a condition in the
 * world, and it should surface as an ordinary Error with a stack trace.
 */
export type VetaErrorCode =
  /** No yt-dlp binary could be resolved from config, PATH, or the bundle. */
  | "YTDLP_NOT_FOUND"
  /** yt-dlp failed in a way matching known YouTube-side extraction drift. */
  | "EXTRACTION_DRIFT"
  /** YouTube demanded proof the caller is not a bot. */
  | "BOT_CHECK"
  /** YouTube rate-limited the request. */
  | "RATE_LIMITED"
  /** The video is private, deleted, members-only, or age-gated. */
  | "VIDEO_UNAVAILABLE"
  /** The video has no caption track in any language at all. */
  | "NO_CAPTIONS"
  /** A specific requested language has no track. */
  | "LANGUAGE_UNAVAILABLE"
  /** A payload parsed, but its shape is not the one this version understands. */
  | "PAYLOAD_SHAPE_CHANGED"
  /** The output directory and the data directory overlap. */
  | "ROOT_OVERLAP"
  /** A path resolved outside the directory that was meant to contain it. */
  | "PATH_ESCAPE"
  /** The argument given is not a YouTube URL or video id. */
  | "INPUT_UNRECOGNIZED";

/**
 * An error whose message is meant to be read by a person, not a stack trace.
 *
 * Carrying the code separately from the message is what lets the CLI choose an
 * exit code without parsing prose, and what lets a test assert the condition
 * rather than the wording.
 */
export class VetaError extends Error {
  readonly code: VetaErrorCode;

  constructor(code: VetaErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "VetaError";
    this.code = code;
  }
}

/** Narrows an unknown caught value, since `catch` gives no type. */
export function isVetaError(value: unknown): value is VetaError {
  return value instanceof VetaError;
}
