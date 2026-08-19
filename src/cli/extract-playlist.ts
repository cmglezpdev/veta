import { VetaError } from "../domain/errors/veta-error.ts";
import type { ProgressListener } from "../pipeline/progress.ts";
import { runPlaylistExtraction, type RunPlaylistResult } from "../pipeline/run-playlist-extraction.ts";
import type { ExtractionSourcePort } from "../ports/extraction-source.ts";
import type { PlaylistSourcePort } from "../ports/playlist-source.ts";
import type { StorePort } from "../ports/store.ts";

export type ExtractPlaylistOptions = {
  /** `--force` equivalent: re-extract every selected member regardless of prior state. */
  readonly force?: boolean;
  /** Observer for step-by-step feedback; the CLI hangs a renderer here. */
  readonly onProgress?: ProgressListener;
};

/**
 * The `veta <playlist-url>` command: run the loop, print the one-line stdout
 * contract, then report and throw on partial failure — in that order (D10),
 * so a partly-broken run still hands back a usable prompt path. Streams are
 * parameters, like `list()`/`purge()`, so a test can capture them.
 */
export async function extractPlaylist(
  input: string,
  playlistSource: PlaylistSourcePort,
  source: ExtractionSourcePort,
  store: StorePort,
  stdout: NodeJS.WritableStream,
  stderr: NodeJS.WritableStream,
  options: ExtractPlaylistOptions = {},
): Promise<RunPlaylistResult> {
  const result = await runPlaylistExtraction(input, playlistSource, source, store, {
    force: options.force ?? false,
    onProgress: options.onProgress,
  });

  // The one line scripts can rely on, printed before any partial-failure
  // throw below — the prompt is useful even when some members failed.
  stdout.write(`${result.promptPath}\n`);

  if (result.failedCount > 0) {
    for (const outcome of result.outcomes) {
      if (outcome.status === "extracted") continue;
      const title = outcome.title ?? `position ${outcome.position}`;
      const reason = outcome.errorMessage ?? "did not complete";
      stderr.write(`[${outcome.position}] ${title}: ${reason}\n`);
    }
    throw new VetaError(
      "PLAYLIST_PARTIAL_FAILURE",
      `${result.failedCount} of ${result.outcomes.length} member(s) did not complete.`,
    );
  }

  return result;
}
