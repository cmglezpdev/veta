/**
 * The calibration gate.
 *
 * Paragraph quality is the kind of thing a reviewer approves without checking:
 * the rendered markdown looks reasonable whether the breaks were chosen well
 * or made under duress, and the two documents are nearly indistinguishable by
 * eye. An earlier revision of the design shipped exactly that failure — a rule
 * derived analytically that fired zero times against real data, while the word
 * cap silently did 56% of the work. It was caught by measuring, not by reading.
 *
 * So the bounds are asserted mechanically, against the full 81-minute payload
 * rather than a synthetic one. `node scripts/inspect-transcript.ts` prints the
 * distributions these assertions are drawn from.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseInfoJson } from "../../adapters/ytdlp/info-json.ts";
import { parseJson3 } from "../../adapters/ytdlp/json3.ts";
import { assignChapters } from "./chapters.ts";
import type { BreakReason } from "./segment.ts";
import { PARAGRAPH_MAX_WORDS, SENTENCE_END, segmentParagraphs } from "./segment.ts";

const FIXTURES = new URL("../../adapters/ytdlp/__fixtures__/", import.meta.url);
const readJson = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(name, FIXTURES), "utf8"));

const metadata = parseInfoJson(readJson("info.json"));
const cues = assignChapters(parseJson3(readJson("captions.full.en.json3")).cues, metadata.chapters);
const paragraphs = segmentParagraphs(cues);

const reasons = paragraphs.map((p) => p.endedBy).filter((r): r is BreakReason => r !== null);
const share = (reason: BreakReason): number =>
  reasons.filter((r) => r === reason).length / reasons.length;

const lengths = paragraphs.map((p) => p.text.split(/\s+/).length).sort((a, b) => a - b);
const percentile = (q: number): number => lengths[Math.floor((lengths.length - 1) * q)]!;

describe("paragraph calibration against the reference video", () => {
  it("has real material to measure", () => {
    expect(metadata.chapters).toHaveLength(21);
    expect(paragraphs.length).toBeGreaterThan(100);
  });

  // The cap is the emergency rule. A high share means paragraphs are ending
  // because they ran out of room, not because a break was found.
  it("rarely falls back to the word cap", () => {
    expect(share("cap")).toBeLessThan(0.15);
  });

  it("produces paragraphs a person will actually read", () => {
    expect(percentile(0.5)).toBeGreaterThanOrEqual(60);
    expect(percentile(0.5)).toBeLessThanOrEqual(160);
  });

  // The retro-split lands before the cap trips, so the longest paragraph may
  // exceed the cap by up to the cues carried past it — but not without bound.
  it("keeps even the longest paragraph bounded", () => {
    expect(percentile(1)).toBeLessThanOrEqual(PARAGRAPH_MAX_WORDS + 40);
  });

  // NORM-04: chapter-bounded sections contain only their own chapter's text.
  it("never lets a paragraph straddle a chapter boundary", () => {
    const straddling = paragraphs.filter((paragraph, i) => {
      const upper = paragraphs[i + 1]?.startMs ?? Infinity;
      const within = cues.filter((c) => c.startMs >= paragraph.startMs && c.startMs < upper);
      return new Set(within.map((c) => c.chapterIndex)).size > 1;
    });
    expect(straddling).toHaveLength(0);
  });

  /**
   * The design now breaks primarily on sentence ends: YouTube's ASR puts most
   * sentence marks mid-cue ("the market. Next"), and the segmenter surfaces
   * them by splitting such cues at their last sentence end before grouping,
   * so paragraphs end on completed ideas. Pauses remain as the fallback for
   * speech that carries no punctuation.
   *
   * This replaces the earlier pin that paused breaks should dominate. That
   * philosophy treated `sentence` dominating as a symptom of a missing
   * signal; the current design makes sentence ends the signal on purpose.
   * The regression guard is now the actual goal: a paragraph should not end
   * mid-sentence. A small share is allowed for chapter-forced breaks and
   * for very long sentences with no punctuation — but a regression back to
   * pause-only segmentation, which cuts mid-sentence freely, must fail.
   */
  it("ends paragraphs on completed sentences", () => {
    const midSentence = paragraphs.filter(
      (p) => p.endedBy !== null && p.endedBy !== "chapter" && !SENTENCE_END.test(p.text.trim()),
    );
    const share = midSentence.length / paragraphs.length;
    expect(share).toBeLessThan(0.15);
  });
});
