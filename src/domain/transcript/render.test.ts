import { describe, expect, it } from "vitest";
import type { VideoMetadata } from "../video/metadata.ts";
import { renderTranscript } from "./render.ts";
import type { Paragraph } from "./segment.ts";

const URL_ = "https://www.youtube.com/watch?v=abc123";

function metadata(overrides: Partial<VideoMetadata> = {}): VideoMetadata {
  return {
    id: "abc123",
    title: "A Short Talk",
    durationSec: 3_725,
    uploader: "Some Channel",
    thumbnailUrl: null,
    canonicalUrl: URL_,
    chapters: [
      { title: "Opening", startSec: 0, endSec: 60 },
      { title: "The Middle", startSec: 60, endSec: 120 },
    ],
    ...overrides,
  };
}

function paragraph(
  startMs: number,
  text: string,
  chapterIndex: number | null,
  endedBy: Paragraph["endedBy"] = null,
): Paragraph {
  return { startMs, text, chapterIndex, endedBy };
}

const PARAGRAPHS = [
  paragraph(0, "First thing said.", 0, "chapter"),
  paragraph(65_000, "Second thing said.", 1, "soft-pause"),
  paragraph(95_500, "Still the middle.", 1),
];

describe("renderTranscript", () => {
  // The golden document. A deliberate change to headings, the credit line,
  // the timestamp format or the link shape must fail here.
  it("renders a chaptered transcript", () => {
    expect(renderTranscript(metadata(), PARAGRAPHS)).toBe(
      `# A Short Talk

*Some Channel · 1:02:05 · ${URL_}*

## 1. Opening

[\`0:00\`](${URL_}&t=0) First thing said.

## 2. The Middle

[\`1:05\`](${URL_}&t=65) Second thing said.

[\`1:35\`](${URL_}&t=95) Still the middle.
`,
    );
  });

  // NORM-04: no chapters means one document, with no chapter artifacts.
  it("renders an unchaptered transcript as a single document", () => {
    const rendered = renderTranscript({ ...metadata(), chapters: [] }, [
      paragraph(0, "All of it.", null),
      paragraph(30_000, "Continues.", null),
    ]);
    expect(rendered).not.toContain("##");
    expect(rendered).toContain("[`0:00`]");
    expect(rendered).toContain("[`0:30`]");
  });

  it("degrades a timestamp to plain text when the video URL is unknown", () => {
    const rendered = renderTranscript({ ...metadata(), canonicalUrl: null }, PARAGRAPHS);
    expect(rendered).toContain("`0:00` First thing said.");
    expect(rendered).not.toContain("](");
  });

  it("omits the credit line when the source gave us nothing to credit", () => {
    const rendered = renderTranscript(
      { ...metadata(), uploader: null, durationSec: 0, canonicalUrl: null },
      [paragraph(0, "Text.", null)],
    );
    expect(rendered).toBe("# A Short Talk\n\n`0:00` Text.\n");
  });

  it("drops the parts of the credit line the source did not provide", () => {
    const rendered = renderTranscript({ ...metadata(), uploader: null }, PARAGRAPHS);
    expect(rendered).toContain(`*1:02:05 · ${URL_}*`);
  });

  // Headings follow the paragraphs, not the chapter list: a chapter nobody
  // spoke in produces no empty section.
  it("emits no heading for a chapter with no speech in it", () => {
    const rendered = renderTranscript(metadata(), [paragraph(65_000, "Only here.", 1)]);
    expect(rendered).toContain("## 2. The Middle");
    expect(rendered).not.toContain("Opening");
  });

  it("renders speech that precedes the first chapter without a heading", () => {
    const rendered = renderTranscript(metadata(), [
      paragraph(0, "Before any chapter.", null),
      paragraph(65_000, "Inside one.", 1),
    ]);
    expect(rendered.indexOf("Before any chapter.")).toBeLessThan(rendered.indexOf("## 2."));
  });

  it("always ends with exactly one trailing newline", () => {
    const rendered = renderTranscript(metadata(), PARAGRAPHS);
    expect(rendered.endsWith("\n")).toBe(true);
    expect(rendered.endsWith("\n\n")).toBe(false);
  });
});
