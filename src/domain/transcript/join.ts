import type { CaptionCue } from "./cue.ts";

/** Punctuation that attaches to the preceding word, so it takes no space. */
const ATTACHES_LEFT = /^[,.;:!?%)\]}]/;

/** Brackets and quotes that attach to what follows them. */
const ATTACHES_RIGHT = /[([{"'‘“]$/;

/**
 * Concatenate consecutive cue texts.
 *
 * Cues are cut on timing, not on grammar, so a sentence routinely spans two
 * of them and neither carries the space between. Concatenating raw yields
 * "easier,but then"; always inserting a space yields " ,but then". The rule
 * below is what produces "easier, but then".
 *
 * This lives in the domain rather than in the yt-dlp adapter because it is a
 * property of segmented speech, not of one wire format — an ASR source will
 * need exactly the same fix.
 */
export function joinCues(cues: readonly CaptionCue[]): string {
  return cues.reduce((acc, cue) => {
    if (acc === "") return cue.text;
    if (cue.text === "") return acc;

    const needsSpace =
      !/\s$/.test(acc) && !ATTACHES_RIGHT.test(acc) && !ATTACHES_LEFT.test(cue.text);

    return needsSpace ? `${acc} ${cue.text}` : acc + cue.text;
  }, "");
}
