import { describe, expect, it } from "vitest";
import type { Chapter } from "../video/metadata.ts";
import { assignChapters } from "./chapters.ts";
import type { CaptionCue } from "./cue.ts";

function cue(startMs: number): CaptionCue {
  return { startMs, endMs: startMs + 500, text: "text" };
}

function chapter(title: string, startSec: number, endSec: number): Chapter {
  return { title, startSec, endSec };
}

const CHAPTERS = [chapter("intro", 0, 60), chapter("middle", 60, 120), chapter("end", 120, 180)];

describe("assignChapters", () => {
  // NORM-04: each chapter section contains only the text falling in its range.
  it("tags each cue with the chapter its start falls in", () => {
    const tagged = assignChapters([cue(10_000), cue(70_000), cue(150_000)], CHAPTERS);
    expect(tagged.map((c) => c.chapterIndex)).toEqual([0, 1, 2]);
  });

  it("treats a chapter range as half-open, so a boundary cue starts the new chapter", () => {
    const tagged = assignChapters([cue(59_999), cue(60_000)], CHAPTERS);
    expect(tagged.map((c) => c.chapterIndex)).toEqual([0, 1]);
  });

  it("leaves cues before the first chapter unassigned", () => {
    const late = [chapter("first", 30, 90)];
    const tagged = assignChapters([cue(0), cue(29_999), cue(30_000)], late);
    expect(tagged.map((c) => c.chapterIndex)).toEqual([null, null, 0]);
  });

  it("assigns null to every cue when the video has no chapters", () => {
    const tagged = assignChapters([cue(0), cue(50_000)], []);
    expect(tagged.map((c) => c.chapterIndex)).toEqual([null, null]);
  });

  it("sorts chapters defensively rather than trusting input order", () => {
    const shuffled = [CHAPTERS[2]!, CHAPTERS[0]!, CHAPTERS[1]!];
    const tagged = assignChapters([cue(10_000), cue(70_000), cue(150_000)], shuffled);
    expect(tagged.map((c) => c.chapterIndex)).toEqual([0, 1, 2]);
  });

  it("preserves cue timing and text untouched", () => {
    const [tagged] = assignChapters([cue(10_000)], CHAPTERS);
    expect(tagged).toMatchObject({ startMs: 10_000, endMs: 10_500, text: "text" });
  });
});
