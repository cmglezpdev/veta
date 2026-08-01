import path from "node:path";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { assignChapters } from "../domain/transcript/chapters.ts";
import { renderTranscript } from "../domain/transcript/render.ts";
import { segmentParagraphs } from "../domain/transcript/segment.ts";
import { slugify } from "../domain/video/slug.ts";
import { selectTrack } from "../domain/video/track-selection.ts";
import type { ExtractionSourcePort } from "../ports/extraction-source.ts";
import { asWorkDir } from "../ports/extraction-source.ts";

export type ExtractOptions = {
  readonly outputRoot: string;
  /** `--lang` equivalent; null runs the FR-4 automatic rule. */
  readonly preferredLang?: string | null;
};

/**
 * Thin Route B extract path: URL in, `transcript.md` out.
 *
 * Wires the track selector, yt-dlp port, and pure normalization pipeline
 * without store/resume machinery.
 */
export async function extract(
  input: string,
  source: ExtractionSourcePort,
  options: ExtractOptions,
): Promise<string> {
  const preferredLang = options.preferredLang ?? null;
  const identity = await source.identify(input);

  const interimSlug = slugify("", identity.externalId);
  let packageDir = path.join(options.outputRoot, interimSlug);
  await mkdir(packageDir, { recursive: true });

  const workDir = asWorkDir(packageDir);
  const { metadata } = await source.fetchMetadata(identity, workDir);

  const finalSlug = slugify(metadata.title, identity.externalId);
  if (finalSlug !== interimSlug) {
    const finalDir = path.join(options.outputRoot, finalSlug);
    await rename(packageDir, finalDir);
    packageDir = finalDir;
  }

  const { track } = selectTrack(
    metadata.captionTracks,
    metadata.originalLanguage,
    preferredLang,
  );
  const { document } = await source.fetchCaptions(identity, track, asWorkDir(packageDir));

  const chaptered = assignChapters(document.cues, metadata.chapters);
  const paragraphs = segmentParagraphs(chaptered);
  const markdown = renderTranscript(metadata, paragraphs);

  const transcriptPath = path.join(packageDir, "transcript.md");
  await writeFile(transcriptPath, markdown, "utf8");

  return transcriptPath;
}
