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

import type { CaptionKind } from "../domain/video/metadata.ts";

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
  /**
   * The metadata phase learned what video this is. Raw facts only — how a
   * duration or an uploader reads on screen is the renderer's decision.
   */
  | {
      readonly kind: "video:identified";
      readonly title: string;
      readonly uploader: string | null;
      readonly durationSec: number;
    }
  /** Which caption track the run will download; `language` is its base subtag. */
  | { readonly kind: "track:selected"; readonly language: string; readonly captionKind: CaptionKind }
  /** A previous unfinished record was found and is being continued. */
  | { readonly kind: "run:resumed"; readonly dirName: string }
  /** A finished run answered entirely from disk; no phase beyond identify ran. */
  | { readonly kind: "run:answered-from-disk"; readonly dirName: string }
  /** Listing finished: how many members this run will walk through. */
  | {
      readonly kind: "playlist:identified";
      readonly title: string;
      readonly totalCount: number;
      readonly selectedCount: number;
    }
  /** A member's turn started. `index`/`total` drive the renderer's `[k/n] ` prefix. */
  | {
      readonly kind: "playlist:member-start";
      readonly index: number;
      readonly total: number;
      readonly position: number;
      readonly externalId: string | null;
      readonly title: string | null;
    }
  /** A member's turn finished, however it went. */
  | {
      readonly kind: "playlist:member-done";
      readonly index: number;
      readonly total: number;
      readonly outcome: "extracted" | "unavailable" | "failed";
      readonly dirName: string | null;
      readonly errorMessage: string | null;
    }
  /** The whole loop finished; final tallies for the CLI's summary line. */
  | {
      readonly kind: "playlist:summary";
      readonly extracted: number;
      readonly failed: number;
      readonly unavailable: number;
    };

export type ProgressListener = (event: ProgressEvent) => void;
