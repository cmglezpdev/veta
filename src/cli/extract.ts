import { runExtraction } from "../pipeline/run-extraction.ts";
import type { ExtractionSourcePort } from "../ports/extraction-source.ts";
import type { StorePort } from "../ports/store.ts";

export type ExtractOptions = {
  /** `--lang` equivalent; null runs the FR-4 automatic rule. */
  readonly preferredLang?: string | null;
  /** `--force` equivalent: discard prior progress and re-extract. */
  readonly force?: boolean;
};

/**
 * The `veta extract` command, in CLI terms: a URL in, a path to print out.
 *
 * Orchestration moved to `pipeline/run-extraction.ts` once runs began keeping
 * state — a command that also owned the step sequence would be the only place
 * to hang resume off, and resume is not a property of the CLI. What is left
 * here is the translation: the runner speaks in run records, the CLI prints
 * paths.
 */
export async function extract(
  input: string,
  source: ExtractionSourcePort,
  store: StorePort,
  options: ExtractOptions = {},
): Promise<string> {
  const { transcriptPath } = await runExtraction(input, source, store, {
    preferredLang: options.preferredLang ?? null,
    force: options.force ?? false,
  });

  return transcriptPath;
}
