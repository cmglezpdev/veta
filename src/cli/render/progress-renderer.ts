import type { PhaseOutcome, ProgressListener, ProgressPhase } from "../../pipeline/progress.ts";

/**
 * The stream is a parameter rather than `process.stderr` so a test can hand in
 * a capture; `isTTY` rides along because that is where Node declares it.
 */
export type ProgressStream = {
  write(chunk: string): unknown;
  readonly isTTY?: boolean;
};

export type ProgressRendererOptions = {
  /** Overrides the stream's own `isTTY`; absent both, plain mode wins. */
  readonly isTTY?: boolean;
  readonly intervalMs?: number;
  /**
   * Defaults to the resolved `isTTY`. Only ever honoured in TTY mode: the
   * plain dialect stays byte-identical whatever this says, so logs and pipes
   * never see an escape code.
   */
  readonly useColor?: boolean;
};

export type ProgressRenderer = {
  readonly onEvent: ProgressListener;
  /** Stop animating and leave the cursor on a clean line. Idempotent. */
  finish(): void;
  /** Cross out whatever phase was in flight; the error line comes after. */
  fail(): void;
};

const LABELS: Record<ProgressPhase, string> = {
  identify: "Resolving video",
  metadata: "Fetching metadata",
  thumbnail: "Downloading thumbnail",
  captions: "Downloading captions",
  transcript: "Building transcript",
  prompt: "Generating notes prompt",
};

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

/** Carriage return plus erase-to-end: redraw in place without flicker. */
const CLEAR_LINE = "\r\x1b[K";

const DEFAULT_INTERVAL_MS = 80;

/**
 * Turn pipeline progress events into stderr feedback.
 *
 * Two dialects, chosen once at creation: a TTY gets an animated spinner that
 * redraws a single line, while a pipe or CI log gets plain start/done lines —
 * start lines included, because when a run hangs in CI the last `->` line is
 * the only clue to where. All output belongs on stderr; stdout carries the
 * one-line path contract and nothing else.
 *
 * The spinner interval is cleared the moment no phase is live, not merely on
 * `finish()`: a timer left ticking would keep the event loop alive and hold
 * the process open after the run already ended.
 */
export function createProgressRenderer(
  stream: ProgressStream,
  options: ProgressRendererOptions = {},
): ProgressRenderer {
  const isTTY = options.isTTY ?? stream.isTTY ?? false;
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const useColor = isTTY && (options.useColor ?? true);

  // Every painted fragment carries its own reset, so no SGR ever stays open
  // across a `\n` or a `\r` redraw — a half-reset line would bleed color into
  // whatever the terminal prints next.
  const paint = (code: number, text: string): string =>
    useColor ? `\x1b[${code}m${text}\x1b[0m` : text;

  let livePhase: ProgressPhase | null = null;
  let frame = 0;
  let timer: NodeJS.Timeout | null = null;

  const stopSpinner = (): void => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };

  const writeLine = (text: string): void => {
    stream.write(isTTY ? `${CLEAR_LINE}${text}\n` : `${text}\n`);
  };

  const doneLine = (phase: ProgressPhase, outcome: PhaseOutcome): string => {
    const label = LABELS[phase];
    const check = isTTY ? paint(32, "✓") : "ok";
    switch (outcome) {
      case "fresh":
        return `${check} ${label}`;
      case "cached":
        return `${check} ${label} ${paint(2, "(already on disk)")}`;
      case "skipped":
        return paint(2, `${isTTY ? "-" : "--"} ${label} (skipped)`);
    }
  };

  const onEvent: ProgressListener = (event) => {
    switch (event.kind) {
      case "phase:start": {
        if (!isTTY) {
          stream.write(`-> ${LABELS[event.phase]}\n`);
          return;
        }
        livePhase = event.phase;
        frame = 0;
        stream.write(`${CLEAR_LINE}${paint(36, FRAMES[0])} ${LABELS[event.phase]}`);
        stopSpinner();
        timer = setInterval(() => {
          frame = (frame + 1) % FRAMES.length;
          stream.write(`${CLEAR_LINE}${paint(36, FRAMES[frame]!)} ${LABELS[event.phase]}`);
        }, intervalMs);
        return;
      }
      case "phase:done": {
        livePhase = null;
        stopSpinner();
        writeLine(doneLine(event.phase, event.outcome));
        return;
      }
      // The directory name is what the user acts on; bold makes it the one
      // thing the eye lands on in either line.
      case "run:resumed": {
        writeLine(`Resuming ${paint(1, event.dirName)}`);
        return;
      }
      case "run:answered-from-disk": {
        writeLine(`Already extracted: ${paint(1, event.dirName)}`);
        return;
      }
    }
  };

  return {
    onEvent,
    finish(): void {
      stopSpinner();
      if (isTTY && livePhase !== null) {
        stream.write(CLEAR_LINE);
      }
      livePhase = null;
    },
    fail(): void {
      stopSpinner();
      // In plain mode the trailing `->` line already names the failed phase;
      // repeating it would only push the actual error message further away.
      if (isTTY && livePhase !== null) {
        stream.write(`${CLEAR_LINE}${paint(31, "✗")} ${LABELS[livePhase]}\n`);
      }
      livePhase = null;
    },
  };
}
