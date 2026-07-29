import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseInfoJson } from "./info-json.ts";

const REFERENCE = JSON.parse(
  readFileSync(new URL("./__fixtures__/info.json", import.meta.url), "utf8"),
) as Record<string, unknown>;

describe("parseInfoJson", () => {
  describe("against the reference payload", () => {
    const metadata = parseInfoJson(REFERENCE);

    // EXT-01: title, id, duration, uploader and the canonical URL.
    it("extracts the core metadata", () => {
      expect(metadata).toMatchObject({
        id: "1VqKUrxR2C8",
        title: "Building OpenCode with Dax Raad",
        durationSec: 4_861,
        uploader: "The Pragmatic Engineer",
        canonicalUrl: "https://www.youtube.com/watch?v=1VqKUrxR2C8",
      });
    });

    // EXT-02 / A1: chapters carry an END as well as a start. Chapter-aware
    // splitting is unimplementable without knowing where a chapter stops.
    it("extracts all 21 chapters with both boundaries", () => {
      expect(metadata.chapters).toHaveLength(21);
      expect(metadata.chapters.every((c) => c.endSec > c.startSec)).toBe(true);
      expect(metadata.chapters[0]).toEqual({ title: "Intro", startSec: 0, endSec: 423 });
    });

    it("returns chapters in ascending order", () => {
      const starts = metadata.chapters.map((c) => c.startSec);
      expect(starts).toEqual([...starts].sort((a, b) => a - b));
    });
  });

  it("sorts chapters the source handed over out of order", () => {
    const { chapters } = parseInfoJson({
      id: "x",
      title: "t",
      duration: 300,
      chapters: [
        { title: "second", start_time: 100, end_time: 200 },
        { title: "first", start_time: 0, end_time: 100 },
      ],
    });
    expect(chapters.map((c) => c.title)).toEqual(["first", "second"]);
  });

  it("closes a final chapter with no end at the video's duration", () => {
    const { chapters } = parseInfoJson({
      id: "x",
      title: "t",
      duration: 300,
      chapters: [{ title: "only", start_time: 30 }],
    });
    expect(chapters[0]).toEqual({ title: "only", startSec: 30, endSec: 300 });
  });

  it("skips a chapter entry with no start at all", () => {
    const { chapters } = parseInfoJson({
      id: "x",
      title: "t",
      chapters: [{ title: "nowhere" }, { title: "real", start_time: 10 }],
    });
    expect(chapters.map((c) => c.title)).toEqual(["real"]);
  });

  it("names an untitled chapter rather than dropping it", () => {
    const { chapters } = parseInfoJson({
      id: "x",
      title: "t",
      chapters: [{ start_time: 0, end_time: 10 }],
    });
    expect(chapters[0]?.title).toBe("Untitled");
  });

  // EXT-02: a video without chapters is normal input, not a failure.
  it("treats an absent chapter list as an empty one", () => {
    expect(parseInfoJson({ id: "x", title: "t" }).chapters).toEqual([]);
    expect(parseInfoJson({ id: "x", title: "t", chapters: null }).chapters).toEqual([]);
  });

  it("reports absent optional fields as null rather than guessing", () => {
    expect(parseInfoJson({ id: "x", title: "t" })).toMatchObject({
      uploader: null,
      thumbnailUrl: null,
      canonicalUrl: null,
      durationSec: 0,
    });
  });

  // NFR-8: a payload whose shape moved upstream must fail at the boundary,
  // not as a TypeError three layers down.
  it("fails at the boundary when the payload lost its identity fields", () => {
    expect(() => parseInfoJson({ title: "t" })).toThrow(/missing id or title/);
    expect(() => parseInfoJson({ id: "x" })).toThrow(/missing id or title/);
    expect(() => parseInfoJson({ id: "", title: "t" })).toThrow(/missing id or title/);
  });

  it("rejects a payload that is not an object", () => {
    expect(() => parseInfoJson(null)).toThrow(/not an object/);
    expect(() => parseInfoJson([])).toThrow(/not an object/);
    expect(() => parseInfoJson("string")).toThrow(/not an object/);
  });
});
