/**
 * A single caption line, with timing normalized away from any one source's
 * quirks. Every transcript source (YouTube captions today, ASR later) is
 * expected to produce these.
 */
export type CaptionCue = {
  readonly startMs: number;
  /**
   * The onset of this cue's LAST word — deliberately not the moment the cue
   * stops being displayed on screen.
   *
   * Display windows overlap: a caption stays up while the next one is already
   * being spoken. Deriving `endMs` from a display duration therefore makes
   * consecutive cues overlap, every inter-cue gap comes out negative, and
   * anything downstream that reasons about pauses silently stops working.
   */
  readonly endMs: number;
  readonly text: string;
};

export type CaptionDocument = {
  readonly cues: readonly CaptionCue[];
  /**
   * How many cues had to be clamped to keep the stream monotonic.
   *
   * This is a drift alarm, not a statistic: on real payloads it must be 0.
   * A non-zero count means the source's timing model changed under us.
   */
  readonly clampCount: number;
};

/** True when cues are ordered and non-overlapping. */
export function isMonotonic(cues: readonly CaptionCue[]): boolean {
  return cues.every((cue, i) => {
    const next = cues[i + 1];
    return cue.startMs <= cue.endMs && (next === undefined || cue.endMs <= next.startMs);
  });
}
