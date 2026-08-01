import { YtDlpExtractionSource } from "../adapters/ytdlp/ytdlp-extraction-source.ts";
import { VetaError, isVetaError } from "../domain/errors/veta-error.ts";
import { exitCodeFor } from "./exit-codes.ts";
import { extract } from "./extract.ts";

function outputRootFromEnv(): string {
  return process.env["VETA_DATA_DIR"] ?? process.cwd();
}

function usage(): void {
  process.stderr.write("Usage: veta <youtube-url-or-id>\n");
}

/**
 * Parse argv and run the Route B extract command.
 *
 * Returns a process exit code; throws `VetaError` for expected failures.
 */
export async function run(argv: readonly string[]): Promise<number> {
  const args = argv.slice(2).filter((arg) => arg.length > 0);

  if (args.length === 0) {
    usage();
    throw new VetaError(
      "INPUT_UNRECOGNIZED",
      "Expected a YouTube URL or an 11-character YouTube video id.",
    );
  }

  if (args.length > 1 || args[0] === "--help" || args[0] === "-h") {
    usage();
    throw new VetaError(
      "INPUT_UNRECOGNIZED",
      "Expected a single YouTube URL or an 11-character YouTube video id.",
    );
  }

  const source = new YtDlpExtractionSource();
  const transcriptPath = await extract(args[0]!, source, {
    outputRoot: outputRootFromEnv(),
  });

  process.stdout.write(`${transcriptPath}\n`);
  return 0;
}

/** Composition root entry — only place that constructs adapters for CLI use. */
export function main(): void {
  run(process.argv).then(
    (code) => {
      process.exit(code);
    },
    (error: unknown) => {
      if (isVetaError(error)) {
        process.stderr.write(`${error.message}\n`);
        process.exit(exitCodeFor(error));
        return;
      }

      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(exitCodeFor(error));
    },
  );
}

main();
