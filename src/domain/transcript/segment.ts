import type { ChapteredCue } from "./chapters.ts";
import { joinCues } from "./join.ts";

/**
 * Thresholds are tied to the measured pause distribution of real captions,
 * not to intuition. Against the reference payload, of 2,579 boundaries: the
 * median gap is 240 ms, p90 is 480 ms, and only 39 exceed 1000 ms.
 *
 * Note these are inter-ONSET intervals, not silences: a cue's end is its last
 * word's onset, so a 500 ms gap is roughly 200-250 ms of actual silence. That
 * is why they are named PAUSE_ and not SILENCE_.
 */
export const PARAGRAPH_MIN_WORDS = 40;
export const PARAGRAPH_TARGET_WORDS = 80;
export const PARAGRAPH_MAX_WORDS = 200;
export const PAUSE_STRONG_MS = 1000; // ~p99: an unmistakable pause
export const PAUSE_SOFT_MS = 500; // ~p90: a perceptible pause

export type BreakReason = "chapter" | "strong-pause" | "sentence" | "soft-pause" | "cap";

export type Paragraph = {
  readonly text: string;
  readonly startMs: number;
  readonly chapterIndex: number | null;
  /** Why this paragraph ended. null for the last one, which just ran out. */
  readonly endedBy: BreakReason | null;
};

/** A sentence-final mark, allowing for a closing quote or bracket after it. */
const SENTENCE_END = /[.?!]["'’”)\]]?$/;

function countWords(text: string): number {
  return text === "" ? 0 : text.split(/\s+/).length;
}

/**
 * Decide why — if at all — a paragraph should end between two cues.
 * Rules are ordered, and the first match wins.
 */
function breakReasonAt(
  current: ChapteredCue,
  next: ChapteredCue,
  wordsSoFar: number,
): BreakReason | null {
  if (current.chapterIndex !== next.chapterIndex) return "chapter";

  const gap = next.startMs - current.endMs;

  if (wordsSoFar >= PARAGRAPH_MIN_WORDS && gap >= PAUSE_STRONG_MS) return "strong-pause";
  if (wordsSoFar >= PARAGRAPH_TARGET_WORDS && SENTENCE_END.test(current.text)) return "sentence";
  if (wordsSoFar >= PARAGRAPH_TARGET_WORDS && gap >= PAUSE_SOFT_MS) return "soft-pause";
  if (wordsSoFar >= PARAGRAPH_MAX_WORDS) return "cap";

  return null;
}

/**
 * Group cues into paragraphs.
 *
 * ASR punctuation is too sparse to segment on alone — only 6.8% of cues in
 * the reference payload end in a sentence mark — so pauses carry most of the
 * work, graded by how long they are and how much text has accumulated.
 *
 * When the word cap fires, the split is applied retroactively at the largest
 * gap seen since the target length was crossed, rather than at the cue where
 * the counter happened to trip. Splitting at the trip point is what produces
 * paragraphs that end mid-sentence; the largest recent pause is the best
 * break available in that window.
 */
export function segmentParagraphs(cues: readonly ChapteredCue[]): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  let start = 0;
  let words = 0;
  let bestGap = -1;
  let bestGapIndex = -1;

  const emit = (endIndex: number, endedBy: BreakReason | null): void => {
    const slice = cues.slice(start, endIndex + 1);
    if (slice.length === 0) return;
    paragraphs.push({
      text: joinCues(slice),
      startMs: slice[0]!.startMs,
      chapterIndex: slice[0]!.chapterIndex,
      endedBy,
    });
    start = endIndex + 1;
    words = 0;
    bestGap = -1;
    bestGapIndex = -1;
  };

  for (let i = 0; i < cues.length; i += 1) {
    const current = cues[i]!;
    words += countWords(current.text);

    const next = cues[i + 1];
    if (next === undefined) {
      emit(i, null);
      break;
    }

    // Track the widest pause available for a retroactive split, but only
    // once the paragraph is long enough that splitting there is sensible.
    if (words >= PARAGRAPH_TARGET_WORDS) {
      const gap = next.startMs - current.endMs;
      if (gap > bestGap) {
        bestGap = gap;
        bestGapIndex = i;
      }
    }

    const reason = breakReasonAt(current, next, words);
    if (reason === null) continue;

    if (reason === "cap" && bestGapIndex >= 0 && bestGapIndex < i) {
      emit(bestGapIndex, "cap");
      // Re-count the cues carried over into the new paragraph.
      for (let j = start; j <= i; j += 1) words += countWords(cues[j]!.text);
      continue;
    }

    emit(i, reason);
  }

  return paragraphs;
}
