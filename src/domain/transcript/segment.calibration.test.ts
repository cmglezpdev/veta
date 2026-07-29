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
import { PARAGRAPH_MAX_WORDS, segmentParagraphs } from "./segment.ts";

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
   * KNOWN FAILURE, pinned rather than relaxed. The design's target is > 50%;
   * the measured value is 47.6%.
   *
   * The cause is identified: the reference video is an interview, and its
   * captions mark 94 speaker changes that the segmenter is never told about.
   * 65 of those turns land buried mid-paragraph, so paragraphs run past the
   * one boundary a reader would consider obvious, run long, and collide with
   * a sentence mark before they reach a pause. `sentence` dominating at 38.7%
   * is the symptom; the missing speaker boundary is the cause.
   *
   * The bound is therefore asserted at the value we have, so a REGRESSION
   * still fails the build, and raised to 0.5 once speaker changes become a
   * break signal. Relaxing it to a permanently softer target would erase the
   * only record that this is unfinished; skipping it would hide it entirely.
   *
   * See docs/05-segmentation.md, "The open failure".
   */
  it("is still short of the pause-driven target (known, tracked)", () => {
    const pauseDriven = share("strong-pause") + share("soft-pause");
    const nonChapter = 1 - share("chapter");
    const ratio = pauseDriven / nonChapter;

    expect(ratio).toBeGreaterThanOrEqual(0.45);
    expect(ratio, "target reached — raise this bound to 0.5 and delete the pin").toBeLessThan(0.5);
  });
});
