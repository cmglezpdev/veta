import { describe, expect, it } from "vitest";
import type { ChapteredCue } from "./chapters.ts";
import { PARAGRAPH_MAX_WORDS, PARAGRAPH_TARGET_WORDS, segmentParagraphs } from "./segment.ts";

function cue(
  startMs: number,
  endMs: number,
  text: string,
  chapterIndex: number | null = 0,
): ChapteredCue {
  return { startMs, endMs, text, chapterIndex };
}

/** `n` distinct words, so a paragraph's contents can be located exactly. */
function words(tag: string, n: number): string {
  return Array.from({ length: n }, (_, i) => `${tag}_${i}`).join(" ");
}

describe("segmentParagraphs", () => {
  it("returns nothing for no cues", () => {
    expect(segmentParagraphs([])).toEqual([]);
  });

  it("keeps short, uninterrupted speech in one paragraph", () => {
    const paragraphs = segmentParagraphs([cue(0, 500, "one"), cue(600, 900, "two")]);
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]?.text).toBe("one two");
    expect(paragraphs[0]?.endedBy).toBeNull();
  });

  // NORM-04 / A2: a paragraph may never straddle a chapter boundary, so the
  // chapter rule fires regardless of how little has accumulated.
  it("breaks on a chapter change even mid-thought", () => {
    const paragraphs = segmentParagraphs([
      cue(0, 500, "last word of one", 0),
      cue(600, 900, "first of two", 1),
    ]);
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]?.endedBy).toBe("chapter");
    expect(paragraphs[1]?.chapterIndex).toBe(1);
  });

  it("takes a paragraph's start and chapter from its first cue", () => {
    const [paragraph] = segmentParagraphs([cue(7_000, 7_500, "a", 3), cue(7_600, 8_000, "b", 3)]);
    expect(paragraph).toMatchObject({ startMs: 7_000, chapterIndex: 3 });
  });

  it("prefers a strong pause over a sentence mark when both could fire", () => {
    const paragraphs = segmentParagraphs([
      cue(0, 1_000, `${words("a", PARAGRAPH_TARGET_WORDS)}.`),
      cue(2_500, 3_000, "next"),
    ]);
    expect(paragraphs[0]?.endedBy).toBe("strong-pause");
  });

  it("prefers a sentence mark over a soft pause when both could fire", () => {
    const paragraphs = segmentParagraphs([
      cue(0, 1_000, `${words("a", PARAGRAPH_TARGET_WORDS)}.`),
      cue(1_600, 2_000, "next"),
    ]);
    expect(paragraphs[0]?.endedBy).toBe("sentence");
  });

  it("falls back to a soft pause when the speech carries no punctuation", () => {
    const paragraphs = segmentParagraphs([
      cue(0, 1_000, words("a", PARAGRAPH_TARGET_WORDS)),
      cue(1_600, 2_000, "next"),
    ]);
    expect(paragraphs[0]?.endedBy).toBe("soft-pause");
  });

  it("ignores a strong pause before the paragraph is worth breaking", () => {
    const paragraphs = segmentParagraphs([cue(0, 500, "too short"), cue(9_000, 9_500, "next")]);
    expect(paragraphs).toHaveLength(1);
  });

  // The retro-split: when nothing but the cap is left, the break lands at the
  // widest pause seen since the target length, NOT where the counter tripped.
  // Splitting at the trip point is what produces paragraphs cut mid-sentence.
  it("applies the word cap retroactively at the widest recent pause", () => {
    const WORDS_PER_CUE = 10;
    const WIDEST_GAP_AT = 10;
    const cues: ChapteredCue[] = [];
    let t = 0;

    for (let i = 0; i < 22; i += 1) {
      const start = t;
      const end = start + 900;
      cues.push(cue(start, end, words(`w${i}`, WORDS_PER_CUE)));
      // Every gap stays under the soft-pause threshold so only the cap can
      // fire; one is merely wider than the rest.
      t = end + (i === WIDEST_GAP_AT ? 400 : 100);
    }

    const capTripsAt = PARAGRAPH_MAX_WORDS / WORDS_PER_CUE - 1;
    expect(capTripsAt).toBeGreaterThan(WIDEST_GAP_AT);

    const paragraphs = segmentParagraphs(cues);

    expect(paragraphs[0]?.endedBy).toBe("cap");
    expect(paragraphs[0]?.text.endsWith(`w${WIDEST_GAP_AT}_${WORDS_PER_CUE - 1}`)).toBe(true);
    expect(paragraphs[1]?.text.startsWith(`w${WIDEST_GAP_AT + 1}_0`)).toBe(true);
    // The split must not have landed where the counter tripped.
    expect(paragraphs[0]?.text).not.toContain(`w${capTripsAt}_0`);
  });

  it("marks only the final paragraph as having simply run out", () => {
    const paragraphs = segmentParagraphs([
      cue(0, 500, "one", 0),
      cue(600, 900, "two", 1),
      cue(1_000, 1_400, "three", 2),
    ]);
    expect(paragraphs.map((p) => p.endedBy)).toEqual(["chapter", "chapter", null]);
  });

  it("loses no text when it splits", () => {
    const cues = [
      cue(0, 1_000, words("a", PARAGRAPH_TARGET_WORDS)),
      cue(2_500, 3_000, words("b", 5)),
      cue(3_100, 3_500, words("c", 5)),
    ];
    const joined = segmentParagraphs(cues)
      .map((p) => p.text)
      .join(" ");
    expect(joined.split(/\s+/)).toHaveLength(PARAGRAPH_TARGET_WORDS + 10);
  });
});
