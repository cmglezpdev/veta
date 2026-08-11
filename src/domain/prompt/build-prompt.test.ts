import { describe, expect, it } from "vitest";
import type { VideoMetadata } from "../video/metadata.ts";
import { buildNotesPrompt, type PromptTarget } from "./build-prompt.ts";

const BASE: VideoMetadata = {
  id: "vid123",
  title: "Building OpenCode with Dax Raad",
  durationSec: 4893, // 1:21:33
  uploader: "Some Channel",
  thumbnailUrl: null,
  canonicalUrl: "https://www.youtube.com/watch?v=vid123",
  chapters: [
    { title: "Intro", startSec: 0, endSec: 120 },
    { title: "Architecture", startSec: 205, endSec: 900 },
  ],
  originalLanguage: "en",
  captionTracks: [],
};

const TARGET: PromptTarget = {
  transcriptPath: "/home/user/.veta/building-opencode-vid123/transcript.md",
  packageName: "building-opencode-vid123",
  thumbnailPath: null,
};

const COVERED: PromptTarget = {
  ...TARGET,
  thumbnailPath: "/home/user/.veta/building-opencode-vid123/cover.png",
};

describe("buildNotesPrompt", () => {
  it("names the video and where it came from", () => {
    const prompt = buildNotesPrompt(BASE, "en", TARGET);

    expect(prompt).toContain("Building OpenCode with Dax Raad");
    expect(prompt).toContain("https://www.youtube.com/watch?v=vid123");
    expect(prompt).toContain("1:21:33");
    expect(prompt).toContain("Some Channel");
  });

  it("lists the chapters with their start times", () => {
    const prompt = buildNotesPrompt(BASE, "en", TARGET);

    expect(prompt).toContain("Intro");
    expect(prompt).toContain("0:00");
    expect(prompt).toContain("Architecture");
    expect(prompt).toContain("3:25");
  });

  it("omits the URL line when the canonical URL is unknown", () => {
    const prompt = buildNotesPrompt({ ...BASE, canonicalUrl: null }, "en", TARGET);

    expect(prompt).not.toContain("- URL:");
    // The rest of the context block survives the missing field.
    expect(prompt).toContain("Building OpenCode with Dax Raad");
  });

  it("omits the uploader line when the source did not name one", () => {
    const prompt = buildNotesPrompt({ ...BASE, uploader: null }, "en", TARGET);

    expect(prompt).not.toContain("- Uploader:");
  });

  it("omits the chapter section entirely when the video has no chapters", () => {
    const prompt = buildNotesPrompt({ ...BASE, chapters: [] }, "en", TARGET);

    expect(prompt).not.toContain("Chapters");
  });

  it("pins the notes language to the transcript's language when known", () => {
    const prompt = buildNotesPrompt(BASE, "es", TARGET);

    expect(prompt).toContain('Write all notes in "es"');
  });

  it("falls back to the transcript's own language when none was recorded", () => {
    const prompt = buildNotesPrompt(BASE, null, TARGET);

    expect(prompt).toContain("the same language the transcript is written in");
  });

  it("points the assistant at the transcript by its absolute path", () => {
    const prompt = buildNotesPrompt(BASE, "en", TARGET);

    expect(prompt).toContain("/home/user/.veta/building-opencode-vid123/transcript.md");
  });

  it("instructs the assistant to build the notes folder in its own cwd", () => {
    const prompt = buildNotesPrompt(BASE, "en", TARGET);

    // The notes land where the assistant runs, named after the package —
    // never in a notes/ folder beside the transcript inside the data dir.
    expect(prompt).toContain("current working directory");
    expect(prompt).toContain("building-opencode-vid123/README.md");
    expect(prompt).not.toContain("notes/README.md");
    expect(prompt).toContain("mermaid");
    // Every key claim must carry a timestamp deep link back into the video.
    expect(prompt).toContain("timestamp deep link");
  });

  it("instructs the assistant to copy the transcript into the notes folder", () => {
    const prompt = buildNotesPrompt(BASE, "en", TARGET);

    // The copy keeps the notes folder self-contained: the transcript is
    // immutable, so duplicating it cannot drift out of sync.
    expect(prompt).toContain("building-opencode-vid123/transcript.md`");
    expect(prompt).toContain("copy");
  });

  it("orders the README and closes it with a key-takeaways section", () => {
    const prompt = buildNotesPrompt(BASE, "en", TARGET);

    expect(prompt).toContain("in this order");
    expect(prompt).toContain("Key takeaways");
  });

  it("separates the takeaways from the summary: what was established, with results", () => {
    const prompt = buildNotesPrompt(BASE, "en", TARGET);

    // The summary describes the video; the takeaways carry its conclusions.
    expect(prompt).toContain("the takeaways say what it established");
    expect(prompt).toContain("results, measurements, comparisons, decisions");
  });

  it("demands outcomes in every topic file, not just activity", () => {
    const prompt = buildNotesPrompt(BASE, "en", TARGET);

    expect(prompt).toContain("what was done and what came of it");
  });

  it("instructs the assistant to copy the cover into the notes folder", () => {
    const prompt = buildNotesPrompt(BASE, "en", COVERED);

    // Same self-containment rule as the transcript copy: the notes folder
    // must not depend on the data directory staying where it is.
    expect(prompt).toContain("building-opencode-vid123/cover.png`");
    expect(prompt).toContain("/home/user/.veta/building-opencode-vid123/cover.png");
  });

  it("keeps the cover's actual extension instead of assuming one", () => {
    const prompt = buildNotesPrompt(BASE, "en", {
      ...TARGET,
      thumbnailPath: "/home/user/.veta/building-opencode-vid123/cover.webp",
    });

    expect(prompt).toContain("building-opencode-vid123/cover.webp`");
    expect(prompt).not.toContain("cover.png");
  });

  it("instructs the assistant to embed the cover at the top of the README", () => {
    const prompt = buildNotesPrompt(BASE, "en", COVERED);

    expect(prompt).toContain("Embed the cover image at the top of the README");
  });

  it("says nothing about a cover when the package has none", () => {
    const prompt = buildNotesPrompt(BASE, "en", TARGET);

    expect(prompt).not.toContain("cover image");
    expect(prompt).not.toMatch(/cover\.[a-z0-9]+/);
  });

  it("is deterministic: the same input renders the identical prompt", () => {
    expect(buildNotesPrompt(BASE, "es", TARGET)).toBe(buildNotesPrompt(BASE, "es", TARGET));
    expect(buildNotesPrompt(BASE, "es", COVERED)).toBe(buildNotesPrompt(BASE, "es", COVERED));
  });
});
