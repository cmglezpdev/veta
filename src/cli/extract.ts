import path from "node:path";
import { assignChapters } from "../domain/transcript/chapters.ts";
import { renderTranscript } from "../domain/transcript/render.ts";
import { segmentParagraphs } from "../domain/transcript/segment.ts";
import { slugify } from "../domain/video/slug.ts";
import { selectTrack } from "../domain/video/track-selection.ts";
import type { ExtractionSourcePort } from "../ports/extraction-source.ts";
import type { StorePort } from "../ports/store.ts";

export type ExtractOptions = {
  /** `--lang` equivalent; null runs the FR-4 automatic rule. */
  readonly preferredLang?: string | null;
};

/**
 * Thin Route B extract path: URL in, `transcript.md` out.
 *
 * Wires the track selector, the extraction source, and the pure normalization
 * pipeline. Every directory and file goes through the store, so this function
 * never touches `node:fs` and never learns where the data directory is — that
 * belongs to whoever constructs the store.
 *
 * No run state is written. Resume arrives with the pipeline runner; until then
 * there is nothing to resume from, and a `state.json` here would only be a
 * promise veta does not yet keep.
 */
export async function extract(
  input: string,
  source: ExtractionSourcePort,
  store: StorePort,
  options: ExtractOptions = {},
): Promise<string> {
  const preferredLang = options.preferredLang ?? null;
  const identity = await source.identify(input);

  // The title lives in the metadata, which yt-dlp writes *into* the package
  // directory — so the directory has to exist under a provisional name first.
  const interimSlug = slugify("", identity.externalId);
  let workDir = await store.openWorkDir(interimSlug);

  const { metadata } = await source.fetchMetadata(identity, workDir);

  const finalSlug = slugify(metadata.title, identity.externalId);
  if (finalSlug !== interimSlug) {
    workDir = await store.renameWorkDir(workDir, finalSlug);
  }

  const { track } = selectTrack(metadata.captionTracks, metadata.originalLanguage, preferredLang);
  const { document } = await source.fetchCaptions(identity, track, workDir);

  const chaptered = assignChapters(document.cues, metadata.chapters);
  const paragraphs = segmentParagraphs(chaptered);
  const markdown = renderTranscript(metadata, paragraphs);

  const artifact = await store.writeArtifact(workDir, "transcript.md", markdown);

  // Composition, not I/O: the caller wants a path it can print.
  return path.join(workDir, artifact.relPath);
}
