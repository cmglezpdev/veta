import { buildCliProgram } from "./cli-structure.ts";

const noop = async (): Promise<void> => {};

/**
 * FR-23 / D17: yargs completion runner with no adapter side effects.
 *
 * Invoked from the composition root before config, store, or yt-dlp imports.
 */
export function runCompletionArgv(argv: readonly string[]): never {
  buildCliProgram({ extract: noop, doctor: noop }, argv).parseSync();
  process.exit(0);
}
