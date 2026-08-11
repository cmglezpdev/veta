import { describe, expect, it } from "vitest";
import type { ProgressEvent } from "../../pipeline/progress.ts";
import { createProgressRenderer, type SpinnerTimer } from "./progress-renderer.ts";

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

/**
 * Hand-written stand-in for the spinner interval, per the repo's injected-
 * clock rule (docs/06, testing approach): the test advances frames by calling
 * `tick()` itself instead of faking the global timers.
 */
function fakeSpinnerTimer(): {
  readonly timer: SpinnerTimer;
  readonly intervals: number[];
  tick(): void;
  live(): boolean;
  clears(): number;
} {
  let onTick: (() => void) | null = null;
  let clears = 0;
  const intervals: number[] = [];
  return {
    intervals,
    timer: {
      set(tick: () => void, intervalMs: number): unknown {
        onTick = tick;
        intervals.push(intervalMs);
        return tick;
      },
      clear(): void {
        clears += 1;
        onTick = null;
      },
    },
    tick(): void {
      onTick?.();
    },
    live: () => onTick !== null,
    clears: () => clears,
  };
}

describe("createProgressRenderer (non-TTY)", () => {
  it("prints plain start and done lines for a whole run, no ANSI, no timers", () => {
    const stream = captureStream();
    const fake = fakeSpinnerTimer();
    const renderer = createProgressRenderer(stream, { isTTY: false, timer: fake.timer });

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
    // The plain dialect has nothing to animate, so it never touches the timer.
    expect(fake.intervals).toEqual([]);
    expect(fake.live()).toBe(false);
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
    const stream = captureStream();
    const fake = fakeSpinnerTimer();
    const renderer = createProgressRenderer(stream, {
      isTTY: true,
      useColor: false,
      timer: fake.timer,
    });

    renderer.onEvent(event({ kind: "phase:start", phase: "identify" }));
    expect(stream.writes.at(-1)).toBe("\r\x1b[K⠋ Resolving video");
    expect(fake.intervals).toEqual([80]);

    fake.tick();
    expect(stream.writes.at(-1)).toBe("\r\x1b[K⠙ Resolving video");

    fake.tick();
    expect(stream.writes.at(-1)).toBe("\r\x1b[K⠹ Resolving video");
  });

  it("replaces the spinner with a terminal line on done and stops the timer", () => {
    const stream = captureStream();
    const fake = fakeSpinnerTimer();
    const renderer = createProgressRenderer(stream, {
      isTTY: true,
      useColor: false,
      timer: fake.timer,
    });

    renderer.onEvent(event({ kind: "phase:start", phase: "captions" }));
    fake.tick();
    fake.tick();
    renderer.onEvent(event({ kind: "phase:done", phase: "captions", outcome: "fresh" }));

    expect(stream.writes.at(-1)).toBe("\r\x1b[K✓ Downloading captions\n");
    expect(fake.live()).toBe(false);
    expect(fake.clears()).toBe(1);
  });

  it("marks cached and skipped outcomes on the terminal line", () => {
    const stream = captureStream();
    const fake = fakeSpinnerTimer();
    const renderer = createProgressRenderer(stream, {
      isTTY: true,
      useColor: false,
      timer: fake.timer,
    });

    renderer.onEvent(event({ kind: "phase:start", phase: "metadata" }));
    renderer.onEvent(event({ kind: "phase:done", phase: "metadata", outcome: "cached" }));
    renderer.onEvent(event({ kind: "phase:start", phase: "thumbnail" }));
    renderer.onEvent(event({ kind: "phase:done", phase: "thumbnail", outcome: "skipped" }));

    expect(stream.writes).toContain("\r\x1b[K✓ Fetching metadata (already on disk)\n");
    expect(stream.writes.at(-1)).toBe("\r\x1b[K- Downloading thumbnail (skipped)\n");
    expect(fake.live()).toBe(false);
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
    const stream = captureStream();
    const fake = fakeSpinnerTimer();
    const renderer = createProgressRenderer(stream, {
      isTTY: true,
      useColor: false,
      timer: fake.timer,
    });

    renderer.onEvent(event({ kind: "phase:start", phase: "captions" }));
    fake.tick();
    renderer.fail();

    expect(stream.writes.at(-1)).toBe("\r\x1b[K✗ Downloading captions\n");
    expect(fake.live()).toBe(false);
    expect(fake.clears()).toBe(1);
  });

  it("fail() with no live phase prints nothing", () => {
    const stream = captureStream();
    const fake = fakeSpinnerTimer();
    const renderer = createProgressRenderer(stream, {
      isTTY: true,
      useColor: false,
      timer: fake.timer,
    });

    renderer.onEvent(event({ kind: "phase:start", phase: "identify" }));
    renderer.onEvent(event({ kind: "phase:done", phase: "identify", outcome: "fresh" }));
    const before = stream.writes.length;
    renderer.fail();

    expect(stream.writes.length).toBe(before);
    expect(fake.live()).toBe(false);
  });

  it("finish() clears a live spinner line and releases the timer", () => {
    const stream = captureStream();
    const fake = fakeSpinnerTimer();
    const renderer = createProgressRenderer(stream, {
      isTTY: true,
      useColor: false,
      timer: fake.timer,
    });

    renderer.onEvent(event({ kind: "phase:start", phase: "transcript" }));
    renderer.finish();

    expect(stream.writes.at(-1)).toBe("\r\x1b[K");
    expect(fake.live()).toBe(false);
    expect(fake.clears()).toBe(1);
  });

  it("finish() with no live phase is a no-op", () => {
    const stream = captureStream();
    const fake = fakeSpinnerTimer();
    const renderer = createProgressRenderer(stream, {
      isTTY: true,
      useColor: false,
      timer: fake.timer,
    });

    renderer.onEvent(event({ kind: "phase:start", phase: "prompt" }));
    renderer.onEvent(event({ kind: "phase:done", phase: "prompt", outcome: "fresh" }));
    const before = stream.writes.length;
    renderer.finish();

    expect(stream.writes.length).toBe(before);
    expect(fake.live()).toBe(false);
  });

  it("emits no SGR sequence when colors are off, only the line erase", () => {
    const stream = captureStream();
    const fake = fakeSpinnerTimer();
    const renderer = createProgressRenderer(stream, {
      isTTY: true,
      useColor: false,
      timer: fake.timer,
    });

    renderer.onEvent(event({ kind: "run:resumed", dirName: "my-video" }));
    renderer.onEvent(event({ kind: "phase:start", phase: "metadata" }));
    fake.tick();
    fake.tick();
    renderer.onEvent(event({ kind: "phase:done", phase: "metadata", outcome: "cached" }));
    renderer.onEvent(event({ kind: "phase:start", phase: "captions" }));
    renderer.fail();

    // `\x1b[K` (erase) is the only CSI the colorless dialect may use; anything
    // `m`-terminated is a color that NO_COLOR asked us not to print.
    expect(stream.writes.join("")).not.toMatch(/\x1b\[[0-9;]*m/);
  });

  it("honours a custom interval and falls back to the stream's own isTTY", () => {
    const stream = { ...captureStream(), isTTY: true };
    const fake = fakeSpinnerTimer();
    const renderer = createProgressRenderer(stream, {
      intervalMs: 200,
      useColor: false,
      timer: fake.timer,
    });

    renderer.onEvent(event({ kind: "phase:start", phase: "identify" }));
    // The interval is the renderer's ask; whether time has passed is the
    // timer's business, so the seam receives the number and the test ticks.
    expect(fake.intervals).toEqual([200]);
    expect(stream.writes.at(-1)).toBe("\r\x1b[K⠋ Resolving video");
    fake.tick();
    expect(stream.writes.at(-1)).toBe("\r\x1b[K⠙ Resolving video");
    renderer.finish();
    expect(fake.live()).toBe(false);
  });
});

describe("createProgressRenderer (TTY, color)", () => {
  it("defaults useColor to the resolved isTTY and paints the spinner frame cyan", () => {
    const stream = captureStream();
    const fake = fakeSpinnerTimer();
    const renderer = createProgressRenderer(stream, { isTTY: true, timer: fake.timer });

    renderer.onEvent(event({ kind: "phase:start", phase: "identify" }));
    expect(stream.writes.at(-1)).toBe("\r\x1b[K\x1b[36m⠋\x1b[0m Resolving video");

    fake.tick();
    expect(stream.writes.at(-1)).toBe("\r\x1b[K\x1b[36m⠙\x1b[0m Resolving video");
    renderer.finish();
    expect(fake.live()).toBe(false);
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
    const stream = captureStream();
    const fake = fakeSpinnerTimer();
    const renderer = createProgressRenderer(stream, { isTTY: true, timer: fake.timer });

    renderer.onEvent(event({ kind: "phase:start", phase: "captions" }));
    renderer.fail();

    expect(stream.writes.at(-1)).toBe("\r\x1b[K\x1b[31m✗\x1b[0m Downloading captions\n");
    expect(fake.live()).toBe(false);
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
