import { describe, expect, it } from "vitest";
import type { CaptionCue } from "./cue.ts";
import { joinCues } from "./join.ts";

function cues(...texts: readonly string[]): CaptionCue[] {
  return texts.map((text, i) => ({ startMs: i * 1000, endMs: i * 1000 + 500, text }));
}

describe("joinCues", () => {
  // NORM-02: the defect observed on real data. Naive concatenation of two
  // cues cut mid-sentence produced "easier,but then".
  it("separates words across a cue seam", () => {
    expect(joinCues(cues("easier,", "but then"))).toBe("easier, but then");
  });

  it("never runs two words together at a seam", () => {
    expect(joinCues(cues("the whole", "point is"))).toBe("the whole point is");
  });

  it("attaches trailing punctuation to the preceding word", () => {
    expect(joinCues(cues("done", ", finally"))).toBe("done, finally");
    expect(joinCues(cues("really", "?"))).toBe("really?");
  });

  it("attaches an opening bracket to what follows it", () => {
    expect(joinCues(cues("as he said (", "roughly) it works"))).toBe(
      "as he said (roughly) it works",
    );
  });

  it("does not double a space that a cue already carries", () => {
    expect(joinCues(cues("trailing ", "space"))).toBe("trailing space");
  });

  it("skips empty cues without leaving a stray space", () => {
    expect(joinCues(cues("first", "", "second"))).toBe("first second");
  });

  it("returns an empty string for no cues", () => {
    expect(joinCues([])).toBe("");
  });
});
