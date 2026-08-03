/**
 * Ordered extraction pipeline steps for run-state tracking.
 *
 * Track selection folds into step 1 via {@link RunRecord.selectedTrack}; there
 * is no separate step for it. Resume logic walks this list in order.
 */

export const STEP_ORDER = [
  "metadata_fetched",
  "thumbnail_downloaded",
  "captions_downloaded",
  "transcript_normalized",
  "prompt_generated",
] as const;

export type StepName = (typeof STEP_ORDER)[number];

export type StepStatus = "pending" | "complete" | "skipped";
