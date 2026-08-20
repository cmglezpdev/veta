import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { FsStore } from "../adapters/store/fs-store.ts";
import { YtDlpExtractionSource } from "../adapters/ytdlp/ytdlp-extraction-source.ts";
import { YtDlpPlaylistSource } from "../adapters/ytdlp/ytdlp-playlist-source.ts";
import { VetaError, isVetaError } from "../domain/errors/veta-error.ts";
import type { VetaErrorCode } from "../domain/errors/veta-error.ts";
import { parseMemberSelection, type RawSelectionFlags } from "../domain/playlist/member-selection.ts";
import { buildCliProgram, CommandFinished, type ExtractArgs } from "./cli-structure.ts";
import { copyToClipboard } from "./clipboard.ts";
import { confirmEnter } from "./confirm.ts";
import { exitCodeFor } from "./exit-codes.ts";
import { extract } from "./extract.ts";
import { extractPlaylist } from "./extract-playlist.ts";
import { list } from "./list.ts";
import { purge } from "./purge.ts";
import { createProgressRenderer } from "./render/progress-renderer.ts";
import { readCurrentVersion } from "./update/current-version.ts";
import {
  currentBinPath,
  detectInstaller,
  updateCommandFor,
} from "./update/package-manager.ts";
import { changelogUrlFor, renderUpdateNotice } from "./update/render-notice.ts";
import {
  fetchLatestFromNpm,
  fileUpdateCache,
  shouldCheckForUpdates,
  startUpdateCheck,
} from "./update/update-check.ts";

/**
 * Where packages live: `~/.veta` unless `VETA_DATA_DIR` overrides it.
 *
 * Packages are app state, not deliverables — one global home keeps them out
 * of whatever folder the command happens to run from, and lets any later
 * invocation anywhere on the machine find every previous extraction.
 */
export function dataDirFromEnv(): string {
  return process.env["VETA_DATA_DIR"] ?? path.join(homedir(), ".veta");
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

/**
 * Route a URL to the playlist path or the single-video path, per the data
 * flow diagram: `identifyPlaylist()` decides, with zero network calls. A
 * `watch?v=…&list=…` URL never matches (pathname stays `/watch`), so it
 * falls straight through to the unmodified single-video path below.
 */
async function runExtract({ url, lang: preferredLang, force, ...curation }: ExtractArgs): Promise<void> {
  // Curation flags are validated before anything is constructed or fetched:
  // a bad `--only` spec must fail on the spot, never after network work.
  const selection = parseMemberSelection(curation satisfies RawSelectionFlags);

  const source = new YtDlpExtractionSource();
  const playlistSource = new YtDlpPlaylistSource();
  const store = new FsStore({ dataDir: dataDirFromEnv() });
  // Progress rides on stderr like everything conversational; a TTY gets the
  // spinner, a pipe gets plain lines. The renderer must be shut down on every
  // exit path — a live spinner line would otherwise sit in front of the error
  // message, and its timer would hold the process open.
  // NO_COLOR convention (https://no-color.org): presence alone, any value,
  // turns color off.
  const renderer = createProgressRenderer(process.stderr, {
    useColor:
      process.stderr.isTTY === true && process.env["NO_COLOR"] === undefined,
  });

  try {
    const identity = await playlistSource.identifyPlaylist(url);
    if (identity !== null) {
      const result = await extractPlaylist(url, playlistSource, source, store, process.stdout, process.stderr, {
        force: force ?? false,
        onProgress: renderer.onEvent,
        selection,
      });
      await offerPromptCopy(result.promptPath);
      return;
    }

    if (selection !== null) {
      throw new VetaError(
        "INPUT_UNRECOGNIZED",
        "--limit, --skip, --only, and --skip-only apply only to playlists; this input is a single video.",
      );
    }

    const { transcriptPath, promptPath } = await extract(url, source, store, {
      preferredLang: preferredLang ?? null,
      force: force ?? false,
      onProgress: renderer.onEvent,
    });
    // The one line scripts can rely on. Everything conversational goes to stderr.
    process.stdout.write(`${transcriptPath}\n`);
    await offerPromptCopy(promptPath);
  } catch (error) {
    renderer.fail();
    throw error;
  } finally {
    renderer.finish();
  }
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
    process.stderr.write(
      `Warning: ${reason} The prompt is still at ${promptPath}.\n`,
    );
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

async function runList(): Promise<void> {
  const store = new FsStore({ dataDir: dataDirFromEnv() });
  const { count } = await list(store, process.stdout);

  if (count === 0) {
    // stdout stays data-only for scripts; the human-facing note rides on stderr.
    process.stderr.write("No extractions stored.\n");
  }
}

async function runPurge(): Promise<void> {
  const store = new FsStore({ dataDir: dataDirFromEnv() });
  await purge(store, process.stdin, process.stderr);
  // readline leaves stdin flowing; release it so the process can exit.
  process.stdin.pause();
}

function buildProgram(argv: readonly string[]) {
  return buildCliProgram(
    {
      extract: runExtract,
      doctor: runDoctor,
      list: runList,
      purge: runPurge,
    },
    argv,
  ).fail((msg, error) => {
    if (error instanceof CommandFinished) {
      throw error;
    }
    if (error !== undefined) {
      throw error;
    }
    throw new VetaError(
      "INPUT_UNRECOGNIZED",
      msg || "Unrecognized command or option.",
    );
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

type UpdateCheck = { result(): Promise<string | null> };

/**
 * Start the "newer version?" lookup so it overlaps the command. Anything that
 * goes wrong here is swallowed: the notice is a courtesy, never a failure.
 */
function beginUpdateCheck(): UpdateCheck | null {
  if (
    !shouldCheckForUpdates(
      process.env,
      process.stderr.isTTY === true,
      process.argv,
    )
  ) {
    return null;
  }
  // Reading package.json is one file read; the registry request leaves right
  // after it and runs alongside the command itself.
  const pending = readCurrentVersion()
    .then((currentVersion) =>
      startUpdateCheck({
        currentVersion,
        fetchLatest: fetchLatestFromNpm,
        cache: fileUpdateCache(
          path.join(dataDirFromEnv(), "update-check.json"),
        ),
        now: Date.now,
      }).result(),
    )
    .catch(() => null);

  return { result: () => pending };
}

/** Print the update box on stderr if a newer version was found. Never throws. */
async function printUpdateNotice(check: UpdateCheck | null): Promise<void> {
  if (check === null) {
    return;
  }
  try {
    const latest = await check.result();
    if (latest === null) {
      return;
    }
    const current = await readCurrentVersion();
    const installer = detectInstaller(await currentBinPath(), process.env);
    process.stderr.write(
      renderUpdateNotice({
        current,
        latest,
        changelogUrl: changelogUrlFor(latest),
        updateCommand: updateCommandFor(installer),
        useColor:
          process.stderr.isTTY === true &&
          process.env["NO_COLOR"] === undefined,
      }),
    );
  } catch {
    // A failed notice must never change the outcome of the command.
  }
}

/** Composition root for normal CLI execution (not completion short-circuit). */
export function main(): void {
  const check = beginUpdateCheck();

  run(process.argv).then(
    async (code) => {
      await printUpdateNotice(check);
      process.exit(code);
    },
    async (error: unknown) => {
      if (isVetaError(error)) {
        process.stderr.write(`${error.message}\n`);
      } else {
        process.stderr.write(
          `${error instanceof Error ? error.message : String(error)}\n`,
        );
      }
      await printUpdateNotice(check);
      process.exit(exitCodeFor(error));
    },
  );
}
