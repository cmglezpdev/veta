import { readFile } from "node:fs/promises";
import { FsStore } from "../adapters/store/fs-store.ts";
import { YtDlpExtractionSource } from "../adapters/ytdlp/ytdlp-extraction-source.ts";
import { VetaError, isVetaError } from "../domain/errors/veta-error.ts";
import type { VetaErrorCode } from "../domain/errors/veta-error.ts";
import { buildCliProgram, CommandFinished } from "./cli-structure.ts";
import { copyToClipboard } from "./clipboard.ts";
import { confirmEnter } from "./confirm.ts";
import { exitCodeFor } from "./exit-codes.ts";
import { extract } from "./extract.ts";

/**
 * Where packages live. Per invocation, from the environment — veta keeps no
 * config file, so there is nothing else to consult.
 */
function dataDirFromEnv(): string {
  return process.env["VETA_DATA_DIR"] ?? process.cwd();
}

function isYargsHelpError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name: string }).name === "YError"
  );
}

function vetaErrorCodeFromString(code: string): VetaErrorCode | undefined {
  const codes: readonly VetaErrorCode[] = [
    "YTDLP_NOT_FOUND",
    "EXTRACTION_DRIFT",
    "BOT_CHECK",
    "RATE_LIMITED",
    "VIDEO_UNAVAILABLE",
    "NO_CAPTIONS",
    "LANGUAGE_UNAVAILABLE",
    "PAYLOAD_SHAPE_CHANGED",
    "ROOT_OVERLAP",
    "PATH_ESCAPE",
    "INPUT_UNRECOGNIZED",
  ];
  return codes.find((candidate) => candidate === code);
}

async function runExtract(url: string, preferredLang?: string, force?: boolean): Promise<void> {
  const source = new YtDlpExtractionSource();
  const store = new FsStore({ dataDir: dataDirFromEnv() });
  const { transcriptPath, promptPath } = await extract(url, source, store, {
    preferredLang: preferredLang ?? null,
    force: force ?? false,
  });
  // The one line scripts can rely on. Everything conversational goes to stderr.
  process.stdout.write(`${transcriptPath}\n`);
  await offerPromptCopy(promptPath);
}

/**
 * Offer to put the generated prompt on the clipboard.
 *
 * Strictly a courtesy on top of the printed path, so it exists only in an
 * interactive session: both stdin and stderr must be TTYs, which keeps pipes,
 * CI, and tests on the plain one-line contract. A clipboard failure is
 * reported and swallowed — the extraction already succeeded.
 */
async function offerPromptCopy(promptPath: string | null): Promise<void> {
  if (promptPath === null || !process.stdin.isTTY || !process.stderr.isTTY) {
    return;
  }

  process.stderr.write(`Prompt ready: ${promptPath}\n`);
  const accepted = await confirmEnter(
    process.stdin,
    process.stderr,
    "Press Enter to copy it to your clipboard (anything else skips) ",
  );
  // readline leaves stdin flowing; release it so the process can exit.
  process.stdin.pause();

  if (!accepted) {
    process.stderr.write("Skipped.\n");
    return;
  }

  try {
    await copyToClipboard(await readFile(promptPath, "utf8"));
    process.stderr.write("Copied to clipboard.\n");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Warning: ${reason} The prompt is still at ${promptPath}.\n`);
  }
}

async function runDoctor(): Promise<void> {
  const source = new YtDlpExtractionSource();
  const health = await source.health();

  for (const detail of health.details) {
    process.stdout.write(`${detail.label}: ${detail.value}\n`);
  }

  if (health.ready) {
    return;
  }

  const warning = health.warnings[0];
  const code =
    warning !== undefined ? vetaErrorCodeFromString(warning.code) : undefined;

  throw new VetaError(
    code ?? "YTDLP_NOT_FOUND",
    warning?.message ?? health.summary,
  );
}

function buildProgram(argv: readonly string[]) {
  return buildCliProgram(
    {
      extract: async ({ url, lang, force }) => {
        await runExtract(url, lang, force);
      },
      doctor: runDoctor,
    },
    argv,
  ).fail((msg, error) => {
    if (error instanceof CommandFinished) {
      throw error;
    }
    if (error !== undefined) {
      throw error;
    }
    throw new VetaError("INPUT_UNRECOGNIZED", msg || "Unrecognized command or option.");
  });
}

/**
 * Parse argv and run the requested veta command.
 *
 * Returns a process exit code; throws `VetaError` for expected failures.
 */
export async function run(argv: readonly string[]): Promise<number> {
  const args = argv.slice(2).filter((arg) => arg.length > 0);

  try {
    await buildProgram(args).parseAsync();
    return 0;
  } catch (error) {
    if (error instanceof CommandFinished) {
      return error.exitCode;
    }
    if (isYargsHelpError(error)) {
      return 0;
    }
    throw error;
  }
}

/** Composition root for normal CLI execution (not completion short-circuit). */
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
