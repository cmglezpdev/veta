/**
 * What an extraction run tells whoever is watching it.
 *
 * The pipeline speaks in phases, not in steps: `identify` has no run-record
 * step, and the record's step names describe persistence, while these events
 * describe waiting — the two vocabularies serve different masters. Outcomes
 * distinguish work that cost network (`fresh`) from work answered by files a
 * previous run left behind (`cached`) and from work that degraded away
 * (`skipped`), because "instant" and "downloaded" deserve different lines.
 */

export type ProgressPhase =
  | "identify"
  | "metadata"
  | "thumbnail"
  | "captions"
  | "transcript"
  | "prompt";

export type PhaseOutcome = "fresh" | "cached" | "skipped";

export type ProgressEvent =
  | { readonly kind: "phase:start"; readonly phase: ProgressPhase }
  | { readonly kind: "phase:done"; readonly phase: ProgressPhase; readonly outcome: PhaseOutcome }
  /** A previous unfinished record was found and is being continued. */
  | { readonly kind: "run:resumed"; readonly dirName: string }
  /** A finished run answered entirely from disk; no phase beyond identify ran. */
  | { readonly kind: "run:answered-from-disk"; readonly dirName: string };

export type ProgressListener = (event: ProgressEvent) => void;
