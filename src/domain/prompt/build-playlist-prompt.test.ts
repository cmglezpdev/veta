import { describe, expect, it } from "vitest";
import {
  buildPlaylistPrompt,
  type PlaylistPromptMember,
  type PlaylistPromptTarget,
} from "./build-playlist-prompt.ts";

const TARGET: PlaylistPromptTarget = {
  notesDir: "clean-architecture-course",
  playlistUrl: "https://www.youtube.com/playlist?list=PLb0iCwbNjkuoY7Ix",
};

const INTRO: PlaylistPromptMember = {
  position: 1,
  title: "Intro to Layers",
  status: "ok",
  promptPath: "/home/user/.veta/intro-to-layers-abc/prompt.md",
  notesFolder: "01-intro-to-layers",
  failureReason: null,
};
const INVERSION: PlaylistPromptMember = {
  position: 2,
  title: "Dependency Inversion",
  status: "ok",
  promptPath: "/home/user/.veta/dependency-inversion-def/prompt.md",
  notesFolder: "02-dependency-inversion",
  failureReason: null,
};
const TESTING: PlaylistPromptMember = {
  position: 3,
  title: "Testing Boundaries",
  status: "ok",
  promptPath: "/home/user/.veta/testing-boundaries-ghi/prompt.md",
  notesFolder: "03-testing-boundaries",
  failureReason: null,
};
const FAILED: PlaylistPromptMember = {
  position: 2,
  title: "Dependency Inversion (unstable)",
  status: "failed",
  promptPath: null,
  notesFolder: null,
  failureReason: "yt-dlp reported BOT_CHECK",
};
const UNAVAILABLE: PlaylistPromptMember = {
  position: 4,
  title: "Private Upload",
  status: "unavailable",
  promptPath: null,
  notesFolder: null,
  failureReason: "Video is private",
};

const READY = [INTRO, INVERSION, TESTING];
const MIXED = [INTRO, FAILED, TESTING, UNAVAILABLE];
const ALL_FAILED = [FAILED, UNAVAILABLE];
// Deliberately not in position order — proves the builder never sorts.
const UNSORTED = [TESTING, INTRO, INVERSION];

describe("buildPlaylistPrompt", () => {
  it("names the playlist and where it came from", () => {
    const prompt = buildPlaylistPrompt("Clean Architecture Course", READY, TARGET);

    expect(prompt).toContain("Clean Architecture Course");
    expect(prompt).toContain(TARGET.playlistUrl);
  });

  it("omits the URL line when the playlist URL is unknown", () => {
    const prompt = buildPlaylistPrompt("Clean Architecture Course", READY, {
      ...TARGET,
      playlistUrl: null,
    });

    expect(prompt).not.toContain("- URL:");
  });

  it("points each subagent at its member prompt by absolute path", () => {
    const prompt = buildPlaylistPrompt("Clean Architecture Course", READY, TARGET);

    for (const member of READY) {
      expect(prompt).toContain(member.promptPath);
    }
  });

  it("names each member's notes subfolder under the library root", () => {
    const prompt = buildPlaylistPrompt("Clean Architecture Course", READY, TARGET);

    expect(prompt).toContain("clean-architecture-course/01-intro-to-layers/");
  });

  it("renders members in the given order, never sorted", () => {
    const prompt = buildPlaylistPrompt("Clean Architecture Course", UNSORTED, TARGET);

    expect(prompt.indexOf(TESTING.title)).toBeLessThan(prompt.indexOf(INTRO.title));
    expect(prompt.indexOf(INTRO.title)).toBeLessThan(prompt.indexOf(INVERSION.title));
  });

  it("casts the assistant as an orchestrator that delegates", () => {
    const prompt = buildPlaylistPrompt("Clean Architecture Course", READY, TARGET);

    expect(prompt).toContain("one subagent per");
    expect(prompt).toContain("in parallel");
  });

  it("forbids the orchestrator from reading transcripts itself", () => {
    const prompt = buildPlaylistPrompt("Clean Architecture Course", READY, TARGET);

    expect(prompt).toMatch(/do not read[^.]*transcript/i);
    expect(prompt).not.toContain("transcript.md");
  });

  it("gives the subagent brief the no-rename invariant", () => {
    const prompt = buildPlaylistPrompt("Clean Architecture Course", READY, TARGET);

    expect(prompt).toContain("do not change that path");
    expect(prompt).toContain("never renumber");
  });

  it("names the root README the orchestrator must write", () => {
    const prompt = buildPlaylistPrompt("Clean Architecture Course", READY, TARGET);

    expect(prompt).toContain("clean-architecture-course/README.md");
  });

  it("requires the cross-video guide sections", () => {
    const prompt = buildPlaylistPrompt("Clean Architecture Course", READY, TARGET);

    expect(prompt).toContain("Suggested reading path");
    expect(prompt).toContain("What this library covers");
  });

  it("lists failed/unavailable members with position and reason", () => {
    const prompt = buildPlaylistPrompt("Clean Architecture Course", MIXED, TARGET);

    expect(prompt).toContain("Not included");
    expect(prompt).toContain(FAILED.failureReason);
    expect(prompt).toContain(FAILED.title);
    expect(prompt).toContain(UNAVAILABLE.failureReason);
  });

  it("never hands a failed member a prompt path or a folder", () => {
    const prompt = buildPlaylistPrompt("Clean Architecture Course", MIXED, TARGET);
    const step2 = prompt.indexOf("## Step 2");
    const step3 = prompt.indexOf("## Step 3");
    const delegateRegion = prompt.slice(step2, step3);

    expect(delegateRegion).not.toContain(`${FAILED.title}\` |`);
  });

  it('omits the "Not included" section when every member succeeded', () => {
    const prompt = buildPlaylistPrompt("Clean Architecture Course", READY, TARGET);

    expect(prompt).not.toContain("Not included");
  });

  it("degrades gracefully when nothing is delegable", () => {
    const prompt = buildPlaylistPrompt("Clean Architecture Course", ALL_FAILED, TARGET);

    expect(prompt).not.toContain("| # | Video |");
    expect(prompt).toContain("clean-architecture-course/README.md");
  });

  it("offers a sequential fallback when subagents are unavailable", () => {
    const prompt = buildPlaylistPrompt("Clean Architecture Course", READY, TARGET);

    expect(prompt).toContain("one at a time");
  });

  it("is deterministic", () => {
    expect(buildPlaylistPrompt("Clean Architecture Course", READY, TARGET)).toBe(
      buildPlaylistPrompt("Clean Architecture Course", READY, TARGET),
    );
    expect(buildPlaylistPrompt("Clean Architecture Course", MIXED, TARGET)).toBe(
      buildPlaylistPrompt("Clean Architecture Course", MIXED, TARGET),
    );
  });
});
