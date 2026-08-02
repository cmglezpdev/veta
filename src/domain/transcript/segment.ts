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
export const SENTENCE_END = /[.?!]["'’”)\]]?$/;

/**
 * How far past a decided break the segmenter keeps scanning for the next
 * sentence end. A pause or the word cap often lands mid-sentence; the break
 * is moved forward to the nearest sentence end within this many words.
 */
export const PARAGRAPH_LOOKAHEAD_WORDS = 20;

/** Closing quotes/brackets that attach to the preceding sentence mark. */
const SENTENCE_CLOSING = /["'’”)\]]/;

/**
 * True when `mark` (an index into `text`) is a real sentence end: the rest of
 * the cue is only closing quotes, then whitespace, then either nothing or the
 * start of a new sentence. Requiring the whitespace is what keeps decimals
 * ("3.5") and abbreviations ("i.e.") from counting as sentence ends.
 */
function isSentenceEndAt(text: string, mark: number): boolean {
  let j = mark + 1;
  while (j < text.length && SENTENCE_CLOSING.test(text[j]!)) j += 1;
  if (j >= text.length) return true;
  if (text[j] !== " ") return false;
  while (j < text.length && text[j] === " ") j += 1;
  if (j >= text.length) return true;
  return /[A-Z0-9[>(]/.test(text[j]!);
}

/**
 * Split a cue's text at its last real sentence end, returning [head, tail].
 * head ends with the sentence mark and any closing quotes; tail is the rest
 * of the cue, which begins the next sentence. A cue without a sentence end
 * is returned unchanged as [text, ""].
 */
function splitCueAtSentenceEnd(text: string): [string, string] {
  let splitAt = -1;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if ((ch === "." || ch === "!" || ch === "?") && isSentenceEndAt(text, i)) {
      splitAt = i;
    }
  }
  if (splitAt < 0) return [text, ""];
  let end = splitAt;
  while (end + 1 < text.length && SENTENCE_CLOSING.test(text[end + 1]!)) end += 1;
  return [text.slice(0, end + 1).trim(), text.slice(end + 1).trim()];
}

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
 * Index of the next cue, at or after `fromIndex`, that ends in a sentence
 * mark — never past a chapter boundary or beyond `PARAGRAPH_LOOKAHEAD_WORDS`
 * of carried text. Returns null when the break should stay where it was.
 */
function findNextSentenceEnd(
  prepared: readonly ChapteredCue[],
  fromIndex: number,
  chapterIndex: number | null,
): number | null {
  let wordsSeen = 0;
  for (let j = fromIndex; j < prepared.length; j += 1) {
    const cue = prepared[j]!;
    if (cue.chapterIndex !== chapterIndex) return null;
    if (wordsSeen > PARAGRAPH_LOOKAHEAD_WORDS) return null;
    if (SENTENCE_END.test(cue.text)) return j;
    wordsSeen += countWords(cue.text);
  }
  return null;
}

/**
 * Group cues into paragraphs.
 *
 * The primary break signal is a completed sentence: once the paragraph has
 * reached the target length, a cue that ends in a sentence mark ends the
 * paragraph. YouTube's ASR embeds most sentence marks mid-cue (a cue like
 * "the market. Next"), which is why a naive cue-end test finds almost none —
 * so the cues are split at their last real sentence end first, turning
 * sentence boundaries into cue boundaries.
 *
 * Pauses are the fallback for speech that carries no punctuation. When a
 * pause or the word cap fires mid-sentence, the break is pushed forward to
 * the next sentence end within PARAGRAPH_LOOKAHEAD_WORDS; if none is close
 * enough, the break lands where the pause did.
 *
 * When the word cap fires with no sentence end in reach, the split is
 * applied retroactively at the largest gap seen since the target length was
 * crossed, rather than at the cue where the counter happened to trip.
 * Splitting at the trip point is what produces paragraphs that end
 * mid-sentence; the largest recent pause is the best break available.
 */
export function segmentParagraphs(cues: readonly ChapteredCue[]): Paragraph[] {
  const prepared: ChapteredCue[] = [];
  for (const cue of cues) {
    const [head, tail] = splitCueAtSentenceEnd(cue.text);
    if (tail === "") {
      prepared.push(cue);
    } else {
      prepared.push({ ...cue, text: head });
      prepared.push({ ...cue, text: tail });
    }
  }

  const paragraphs: Paragraph[] = [];
  let start = 0;
  let words = 0;
  let bestGap = -1;
  let bestGapIndex = -1;

  const emit = (endIndex: number, endedBy: BreakReason | null): void => {
    const slice = prepared.slice(start, endIndex + 1);
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

  for (let i = 0; i < prepared.length; i += 1) {
    const current = prepared[i]!;
    words += countWords(current.text);

    const next = prepared[i + 1];
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

    // A pause or the cap is a fallback break. Before taking it mid-sentence,
    // carry the paragraph forward to the next sentence end if it is close.
    if (reason === "strong-pause" || reason === "soft-pause" || reason === "cap") {
      const target = findNextSentenceEnd(prepared, i + 1, current.chapterIndex);
      if (target !== null) {
        emit(target, reason);
        i = target;
        continue;
      }
    }

    if (reason === "cap" && bestGapIndex >= 0 && bestGapIndex < i) {
      emit(bestGapIndex, "cap");
      // Re-count the cues carried over into the new paragraph.
      for (let j = start; j <= i; j += 1) words += countWords(prepared[j]!.text);
      continue;
    }

    emit(i, reason);
  }

  return paragraphs;
}
