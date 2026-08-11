import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProgressEvent } from "../../pipeline/progress.ts";
import { createProgressRenderer } from "./progress-renderer.ts";

function captureStream(): { writes: string[]; write(chunk: string): boolean } {
  const writes: string[] = [];
  return {
    writes,
    write(chunk: string): boolean {
      writes.push(chunk);
      return true;
    },
  };
}

function event(e: ProgressEvent): ProgressEvent {
  return e;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createProgressRenderer (non-TTY)", () => {
  it("prints plain start and done lines for a whole run, no ANSI, no timers", () => {
    vi.useFakeTimers();
    const stream = captureStream();
    const renderer = createProgressRenderer(stream, { isTTY: false });

    renderer.onEvent(event({ kind: "phase:start", phase: "identify" }));
    renderer.onEvent(event({ kind: "phase:done", phase: "identify", outcome: "fresh" }));
    renderer.onEvent(event({ kind: "run:resumed", dirName: "my-video" }));
    renderer.onEvent(event({ kind: "phase:start", phase: "metadata" }));
    renderer.onEvent(event({ kind: "phase:done", phase: "metadata", outcome: "cached" }));
    renderer.onEvent(event({ kind: "phase:start", phase: "thumbnail" }));
    renderer.onEvent(event({ kind: "phase:done", phase: "thumbnail", outcome: "skipped" }));
    renderer.finish();

    expect(stream.writes.join("")).toBe(
      [
        "-> Resolving video\n",
        "ok Resolving video\n",
        "Resuming my-video\n",
        "-> Fetching metadata\n",
        "ok Fetching metadata (already on disk)\n",
        "-> Downloading thumbnail\n",
        "-- Downloading thumbnail (skipped)\n",
      ].join(""),
    );
    expect(stream.writes.join("")).not.toContain("\x1b");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("prints the answered-from-disk line", () => {
    const stream = captureStream();
    const renderer = createProgressRenderer(stream, { isTTY: false });

    renderer.onEvent(event({ kind: "run:answered-from-disk", dirName: "my-video" }));

    expect(stream.writes.join("")).toBe("Already extracted: my-video\n");
  });
});

describe("createProgressRenderer (TTY)", () => {
  it("animates the spinner in place while a phase is live", () => {
    vi.useFakeTimers();
    const stream = captureStream();
    const renderer = createProgressRenderer(stream, { isTTY: true, useColor: false });

    renderer.onEvent(event({ kind: "phase:start", phase: "identify" }));
    expect(stream.writes.at(-1)).toBe("\r\x1b[K⠋ Resolving video");

    vi.advanceTimersByTime(80);
    expect(stream.writes.at(-1)).toBe("\r\x1b[K⠙ Resolving video");

    vi.advanceTimersByTime(80);
    expect(stream.writes.at(-1)).toBe("\r\x1b[K⠹ Resolving video");
  });

  it("replaces the spinner with a terminal line on done and stops the timer", () => {
    vi.useFakeTimers();
    const stream = captureStream();
    const renderer = createProgressRenderer(stream, { isTTY: true, useColor: false });

    renderer.onEvent(event({ kind: "phase:start", phase: "captions" }));
    vi.advanceTimersByTime(160);
    renderer.onEvent(event({ kind: "phase:done", phase: "captions", outcome: "fresh" }));

    expect(stream.writes.at(-1)).toBe("\r\x1b[K✓ Downloading captions\n");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("marks cached and skipped outcomes on the terminal line", () => {
    vi.useFakeTimers();
    const stream = captureStream();
    const renderer = createProgressRenderer(stream, { isTTY: true, useColor: false });

    renderer.onEvent(event({ kind: "phase:start", phase: "metadata" }));
    renderer.onEvent(event({ kind: "phase:done", phase: "metadata", outcome: "cached" }));
    renderer.onEvent(event({ kind: "phase:start", phase: "thumbnail" }));
    renderer.onEvent(event({ kind: "phase:done", phase: "thumbnail", outcome: "skipped" }));

    expect(stream.writes).toContain("\r\x1b[K✓ Fetching metadata (already on disk)\n");
    expect(stream.writes.at(-1)).toBe("\r\x1b[K- Downloading thumbnail (skipped)\n");
  });

  it("prints resumed and answered-from-disk as their own lines", () => {
    const stream = captureStream();
    const renderer = createProgressRenderer(stream, { isTTY: true, useColor: false });

    renderer.onEvent(event({ kind: "run:resumed", dirName: "my-video" }));
    renderer.onEvent(event({ kind: "run:answered-from-disk", dirName: "my-video" }));

    expect(stream.writes).toEqual([
      "\r\x1b[KResuming my-video\n",
      "\r\x1b[KAlready extracted: my-video\n",
    ]);
  });

  it("fail() crosses out the in-flight phase and stops the timer", () => {
    vi.useFakeTimers();
    const stream = captureStream();
    const renderer = createProgressRenderer(stream, { isTTY: true, useColor: false });

    renderer.onEvent(event({ kind: "phase:start", phase: "captions" }));
    vi.advanceTimersByTime(80);
    renderer.fail();

    expect(stream.writes.at(-1)).toBe("\r\x1b[K✗ Downloading captions\n");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("fail() with no live phase prints nothing", () => {
    vi.useFakeTimers();
    const stream = captureStream();
    const renderer = createProgressRenderer(stream, { isTTY: true, useColor: false });

    renderer.onEvent(event({ kind: "phase:start", phase: "identify" }));
    renderer.onEvent(event({ kind: "phase:done", phase: "identify", outcome: "fresh" }));
    const before = stream.writes.length;
    renderer.fail();

    expect(stream.writes.length).toBe(before);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("finish() clears a live spinner line and releases the timer", () => {
    vi.useFakeTimers();
    const stream = captureStream();
    const renderer = createProgressRenderer(stream, { isTTY: true, useColor: false });

    renderer.onEvent(event({ kind: "phase:start", phase: "transcript" }));
    renderer.finish();

    expect(stream.writes.at(-1)).toBe("\r\x1b[K");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("finish() with no live phase is a no-op", () => {
    vi.useFakeTimers();
    const stream = captureStream();
    const renderer = createProgressRenderer(stream, { isTTY: true, useColor: false });

    renderer.onEvent(event({ kind: "phase:start", phase: "prompt" }));
    renderer.onEvent(event({ kind: "phase:done", phase: "prompt", outcome: "fresh" }));
    const before = stream.writes.length;
    renderer.finish();

    expect(stream.writes.length).toBe(before);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("emits no SGR sequence when colors are off, only the line erase", () => {
    vi.useFakeTimers();
    const stream = captureStream();
    const renderer = createProgressRenderer(stream, { isTTY: true, useColor: false });

    renderer.onEvent(event({ kind: "run:resumed", dirName: "my-video" }));
    renderer.onEvent(event({ kind: "phase:start", phase: "metadata" }));
    vi.advanceTimersByTime(160);
    renderer.onEvent(event({ kind: "phase:done", phase: "metadata", outcome: "cached" }));
    renderer.onEvent(event({ kind: "phase:start", phase: "captions" }));
    renderer.fail();

    // `\x1b[K` (erase) is the only CSI the colorless dialect may use; anything
    // `m`-terminated is a color that NO_COLOR asked us not to print.
    expect(stream.writes.join("")).not.toMatch(/\x1b\[[0-9;]*m/);
  });

  it("honours a custom interval and falls back to the stream's own isTTY", () => {
    vi.useFakeTimers();
    const stream = { ...captureStream(), isTTY: true };
    const renderer = createProgressRenderer(stream, { intervalMs: 200, useColor: false });

    renderer.onEvent(event({ kind: "phase:start", phase: "identify" }));
    vi.advanceTimersByTime(199);
    expect(stream.writes.at(-1)).toBe("\r\x1b[K⠋ Resolving video");
    vi.advanceTimersByTime(1);
    expect(stream.writes.at(-1)).toBe("\r\x1b[K⠙ Resolving video");
    renderer.finish();
  });
});

describe("createProgressRenderer (TTY, color)", () => {
  it("defaults useColor to the resolved isTTY and paints the spinner frame cyan", () => {
    vi.useFakeTimers();
    const stream = captureStream();
    const renderer = createProgressRenderer(stream, { isTTY: true });

    renderer.onEvent(event({ kind: "phase:start", phase: "identify" }));
    expect(stream.writes.at(-1)).toBe("\r\x1b[K\x1b[36m⠋\x1b[0m Resolving video");

    vi.advanceTimersByTime(80);
    expect(stream.writes.at(-1)).toBe("\r\x1b[K\x1b[36m⠙\x1b[0m Resolving video");
    renderer.finish();
  });

  it("paints the check green, label untouched", () => {
    const stream = captureStream();
    const renderer = createProgressRenderer(stream, { isTTY: true });

    renderer.onEvent(event({ kind: "phase:done", phase: "captions", outcome: "fresh" }));

    expect(stream.writes.at(-1)).toBe("\r\x1b[K\x1b[32m✓\x1b[0m Downloading captions\n");
  });

  it("dims the already-on-disk suffix behind a green check", () => {
    const stream = captureStream();
    const renderer = createProgressRenderer(stream, { isTTY: true });

    renderer.onEvent(event({ kind: "phase:done", phase: "metadata", outcome: "cached" }));

    expect(stream.writes.at(-1)).toBe(
      "\r\x1b[K\x1b[32m✓\x1b[0m Fetching metadata \x1b[2m(already on disk)\x1b[0m\n",
    );
  });

  it("dims the whole skipped line", () => {
    const stream = captureStream();
    const renderer = createProgressRenderer(stream, { isTTY: true });

    renderer.onEvent(event({ kind: "phase:done", phase: "thumbnail", outcome: "skipped" }));

    expect(stream.writes.at(-1)).toBe("\r\x1b[K\x1b[2m- Downloading thumbnail (skipped)\x1b[0m\n");
  });

  it("paints the cross red on fail()", () => {
    vi.useFakeTimers();
    const stream = captureStream();
    const renderer = createProgressRenderer(stream, { isTTY: true });

    renderer.onEvent(event({ kind: "phase:start", phase: "captions" }));
    renderer.fail();

    expect(stream.writes.at(-1)).toBe("\r\x1b[K\x1b[31m✗\x1b[0m Downloading captions\n");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bolds the directory name the user will act on", () => {
    const stream = captureStream();
    const renderer = createProgressRenderer(stream, { isTTY: true });

    renderer.onEvent(event({ kind: "run:resumed", dirName: "my-video" }));
    renderer.onEvent(event({ kind: "run:answered-from-disk", dirName: "my-video" }));

    expect(stream.writes).toEqual([
      "\r\x1b[KResuming \x1b[1mmy-video\x1b[0m\n",
      "\r\x1b[KAlready extracted: \x1b[1mmy-video\x1b[0m\n",
    ]);
  });

  it("never colors a pipe, even when asked to", () => {
    const stream = captureStream();
    const renderer = createProgressRenderer(stream, { isTTY: false, useColor: true });

    renderer.onEvent(event({ kind: "phase:start", phase: "identify" }));
    renderer.onEvent(event({ kind: "phase:done", phase: "identify", outcome: "fresh" }));

    expect(stream.writes.join("")).not.toContain("\x1b");
  });
});

describe("createProgressRenderer video:identified", () => {
  it("formats durations as M:SS below the hour and H:MM:SS above it", () => {
    const stream = captureStream();
    const renderer = createProgressRenderer(stream, { isTTY: false });

    renderer.onEvent(
      event({ kind: "video:identified", title: "Short", uploader: null, durationSec: 47 }),
    );
    renderer.onEvent(
      event({ kind: "video:identified", title: "Talk", uploader: null, durationSec: 2537 }),
    );
    renderer.onEvent(
      event({ kind: "video:identified", title: "Long", uploader: null, durationSec: 3909 }),
    );

    expect(stream.writes).toEqual([
      "  Short · 0:47\n",
      "  Talk · 42:17\n",
      "  Long · 1:05:09\n",
    ]);
  });

  it("prints the indented plain line with uploader and duration, no ANSI", () => {
    const stream = captureStream();
    const renderer = createProgressRenderer(stream, { isTTY: false });

    renderer.onEvent(
      event({
        kind: "video:identified",
        title: "Building OpenCode with Dax Raad",
        uploader: "The Pragmatic Engineer",
        durationSec: 4861,
      }),
    );

    expect(stream.writes).toEqual([
      "  Building OpenCode with Dax Raad — The Pragmatic Engineer · 1:21:01\n",
    ]);
    expect(stream.writes.join("")).not.toContain("\x1b");
  });

  it("drops the uploader segment when the source did not name one", () => {
    const stream = captureStream();
    const renderer = createProgressRenderer(stream, { isTTY: false });

    renderer.onEvent(
      event({ kind: "video:identified", title: "Mystery Upload", uploader: null, durationSec: 65 }),
    );

    expect(stream.writes).toEqual(["  Mystery Upload · 1:05\n"]);
  });

  it("keeps the title in default color and dims only the tail in color mode", () => {
    const stream = captureStream();
    const renderer = createProgressRenderer(stream, { isTTY: true });

    renderer.onEvent(
      event({
        kind: "video:identified",
        title: "Building OpenCode with Dax Raad",
        uploader: "The Pragmatic Engineer",
        durationSec: 4861,
      }),
    );

    expect(stream.writes).toEqual([
      "\r\x1b[K  Building OpenCode with Dax Raad\x1b[2m — The Pragmatic Engineer · 1:21:01\x1b[0m\n",
    ]);
  });

  it("dims the whole tail even without an uploader", () => {
    const stream = captureStream();
    const renderer = createProgressRenderer(stream, { isTTY: true });

    renderer.onEvent(
      event({ kind: "video:identified", title: "Mystery Upload", uploader: null, durationSec: 47 }),
    );

    expect(stream.writes).toEqual(["\r\x1b[K  Mystery Upload\x1b[2m · 0:47\x1b[0m\n"]);
  });
});

describe("createProgressRenderer track:selected", () => {
  it("suffixes the captions done line with the language and manual kind", () => {
    const stream = captureStream();
    const renderer = createProgressRenderer(stream, { isTTY: false });

    renderer.onEvent(event({ kind: "track:selected", language: "es", captionKind: "manual" }));
    renderer.onEvent(event({ kind: "phase:done", phase: "captions", outcome: "fresh" }));

    expect(stream.writes).toEqual(["ok Downloading captions (es, manual)\n"]);
    expect(stream.writes.join("")).not.toContain("\x1b");
  });

  it("spells asr out as auto-generated", () => {
    const stream = captureStream();
    const renderer = createProgressRenderer(stream, { isTTY: false });

    renderer.onEvent(event({ kind: "track:selected", language: "en", captionKind: "asr" }));
    renderer.onEvent(event({ kind: "phase:done", phase: "captions", outcome: "fresh" }));

    expect(stream.writes).toEqual(["ok Downloading captions (en, auto-generated)\n"]);
  });

  it("dims the suffix behind the green check in color mode", () => {
    const stream = captureStream();
    const renderer = createProgressRenderer(stream, { isTTY: true });

    renderer.onEvent(event({ kind: "track:selected", language: "en", captionKind: "asr" }));
    renderer.onEvent(event({ kind: "phase:done", phase: "captions", outcome: "fresh" }));

    expect(stream.writes).toEqual([
      "\r\x1b[K\x1b[32m✓\x1b[0m Downloading captions \x1b[2m(en, auto-generated)\x1b[0m\n",
    ]);
  });

  it("renders the captions line exactly as before when no track was announced", () => {
    const stream = captureStream();
    const renderer = createProgressRenderer(stream, { isTTY: false });

    renderer.onEvent(event({ kind: "phase:done", phase: "captions", outcome: "fresh" }));

    expect(stream.writes).toEqual(["ok Downloading captions\n"]);
  });

  it("consumes the remembered track: a later captions line carries no stale suffix", () => {
    const stream = captureStream();
    const renderer = createProgressRenderer(stream, { isTTY: false });

    renderer.onEvent(event({ kind: "track:selected", language: "en", captionKind: "manual" }));
    renderer.onEvent(event({ kind: "phase:done", phase: "captions", outcome: "fresh" }));
    renderer.onEvent(event({ kind: "phase:done", phase: "captions", outcome: "fresh" }));

    expect(stream.writes).toEqual([
      "ok Downloading captions (en, manual)\n",
      "ok Downloading captions\n",
    ]);
  });
});
