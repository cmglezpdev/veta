import type { Chapter } from "../../adapters/ytdlp/info-json.ts";
import type { CaptionCue } from "./cue.ts";

export type ChapteredCue = CaptionCue & {
  /** null for cues that fall before the first chapter starts. */
  readonly chapterIndex: number | null;
};

/**
 * Tag each cue with the chapter it falls in, matched on the cue's start.
 *
 * Chapters must be assigned to cues *before* paragraphs are cut, not after.
 * Segmentation forces a break wherever the chapter changes, and it cannot
 * force a break at a boundary it has not been told about — so a paragraph
 * would otherwise be able to straddle two chapters.
 *
 * Ranges are half-open: a cue starting exactly at a chapter's start belongs
 * to that chapter, not to the one before it.
 */
export function assignChapters(
  cues: readonly CaptionCue[],
  chapters: readonly Chapter[],
): ChapteredCue[] {
  if (chapters.length === 0) {
    return cues.map((cue) => ({ ...cue, chapterIndex: null }));
  }

  const ordered = [...chapters].sort((a, b) => a.startSec - b.startSec);

  return cues.map((cue) => {
    // Walking backwards finds the last chapter that has already started,
    // which is the containing one for any sane input and degrades sensibly
    // for overlapping chapters.
    let chapterIndex: number | null = null;
    for (let i = ordered.length - 1; i >= 0; i -= 1) {
      if (cue.startMs >= ordered[i]!.startSec * 1000) {
        chapterIndex = i;
        break;
      }
    }
    return { ...cue, chapterIndex };
  });
}
