import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isMonotonic } from "../../domain/transcript/cue.ts";
import { parseJson3 } from "./json3.ts";

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8"));
}

describe("parseJson3", () => {
  it("rejects a payload with no events array", () => {
    expect(() => parseJson3({})).toThrow();
    expect(() => parseJson3(null)).toThrow();
    expect(() => parseJson3({ events: "nope" })).toThrow();
  });

  // NORM-01: events whose only segment is a bare newline carry no content.
  it("drops filler events without leaving an artifact behind", () => {
    const doc = parseJson3({
      events: [
        { tStartMs: 0, segs: [{ utf8: "\n" }] },
        { tStartMs: 100, segs: [{ utf8: "real" }] },
        { tStartMs: 200, segs: [{ utf8: "\n" }] },
      ],
    });
    expect(doc.cues.map((c) => c.text)).toEqual(["real"]);
  });

  it("drops events carrying no segments at all", () => {
    const doc = parseJson3({ events: [{ tStartMs: 0 }, { tStartMs: 100, segs: [] }] });
    expect(doc.cues).toEqual([]);
  });

  // NORM-02: segments already carry their own spacing.
  it("concatenates segments verbatim rather than re-spacing them", () => {
    const doc = parseJson3({
      events: [{ tStartMs: 0, segs: [{ utf8: "eas" }, { utf8: "ier," }, { utf8: " but" }] }],
    });
    expect(doc.cues[0]?.text).toBe("easier, but");
  });

  // The F1 defect: dDurationMs is the on-screen display window, which overlaps
  // the following cue. Using it makes every inter-cue gap negative and every
  // pause-based rule downstream stop working.
  it("ends a cue at its last word's onset, never at the display duration", () => {
    const doc = parseJson3({
      events: [
        {
          tStartMs: 1_000,
          dDurationMs: 5_000,
          segs: [
            { utf8: "hello", tOffsetMs: 0 },
            { utf8: " world", tOffsetMs: 400 },
          ],
        },
        { tStartMs: 9_000, dDurationMs: 5_000, segs: [{ utf8: "next", tOffsetMs: 0 }] },
      ],
    });
    expect(doc.cues[0]).toMatchObject({ startMs: 1_000, endMs: 1_400 });
    expect(doc.clampCount).toBe(0);
  });

  it("ignores a trailing whitespace segment when locating the last word", () => {
    const doc = parseJson3({
      events: [
        {
          tStartMs: 0,
          segs: [
            { utf8: "hello", tOffsetMs: 0 },
            { utf8: " world", tOffsetMs: 400 },
            { utf8: " ", tOffsetMs: 900 },
          ],
        },
      ],
    });
    expect(doc.cues[0]?.endMs).toBe(400);
  });

  it("clamps an overlapping cue and counts the correction as drift", () => {
    const doc = parseJson3({
      events: [
        {
          tStartMs: 0,
          segs: [
            { utf8: "a", tOffsetMs: 0 },
            { utf8: " b", tOffsetMs: 5_000 },
          ],
        },
        { tStartMs: 1_000, segs: [{ utf8: "c" }] },
      ],
    });
    expect(doc.cues[0]?.endMs).toBe(1_000);
    expect(doc.clampCount).toBe(1);
  });

  it("never lets a clamp push a cue's end before its start", () => {
    const doc = parseJson3({
      events: [
        { tStartMs: 5_000, segs: [{ utf8: "late", tOffsetMs: 200 }] },
        { tStartMs: 1_000, segs: [{ utf8: "early" }] },
      ],
    });
    expect(doc.cues[0]?.endMs).toBe(5_000);
  });

  // NORM-03, against the full 81-minute payload rather than a slice. A clamp
  // here is not a rounding detail: it means the source's timing model moved
  // and the assumption every pause rule rests on no longer holds.
  describe("against the full reference payload", () => {
    const doc = parseJson3(fixture("captions.full.en.json3"));

    it("produces the whole transcript", () => {
      expect(doc.cues.length).toBeGreaterThan(1_000);
      expect(doc.cues.every((c) => c.text !== "")).toBe(true);
    });

    it("needs no clamping at all", () => {
      expect(doc.clampCount).toBe(0);
    });

    it("is ordered and non-overlapping end to end", () => {
      const overlap = doc.cues.findIndex((c, i) => {
        const next = doc.cues[i + 1];
        return c.startMs > c.endMs || (next !== undefined && c.endMs > next.startMs);
      });
      expect(overlap, `cue ${overlap} breaks monotonicity`).toBe(-1);
      expect(isMonotonic(doc.cues)).toBe(true);
    });
  });
});
