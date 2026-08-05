import path from "node:path";
import { createRunRecord, type RunRecord, withStep } from "../domain/run/run-record.ts";
import { assignChapters } from "../domain/transcript/chapters.ts";
import { renderTranscript } from "../domain/transcript/render.ts";
import { segmentParagraphs } from "../domain/transcript/segment.ts";
import { slugify } from "../domain/video/slug.ts";
import { selectTrack } from "../domain/video/track-selection.ts";
import type { ExtractionSourcePort } from "../ports/extraction-source.ts";
import type { StorePort } from "../ports/store.ts";

export type RunExtractionOptions = {
  /** `--lang` equivalent; null runs the FR-4 automatic rule. */
  readonly preferredLang?: string | null;
  /**
   * Source of `createdAt` / `updatedAt` stamps.
   *
   * Injected rather than read from `Date` directly so a test can assert the
   * ordering of saves without freezing global time.
   */
  readonly now?: () => string;
};

export type RunExtractionResult = {
  /** Absolute path to the rendered transcript, for the caller to print. */
  readonly transcriptPath: string;
  /** Run state as persisted by the final save. */
  readonly record: RunRecord;
};

/**
 * Drive one extraction, recording how far it got.
 *
 * Every step that finishes is written to the store before the next one starts,
 * so a run that dies mid-flight leaves behind an accurate account of itself
 * rather than nothing. That account is all this slice produces — reading it
 * back to skip completed work is the next one.
 *
 * Track selection is not a step of its own: it belongs to `metadata_fetched`,
 * which is why nothing is saved until a track has been chosen. A record
 * claiming metadata succeeded while `selectedTrack` stayed null would describe
 * a state resume cannot act on.
 */
export async function runExtraction(
  input: string,
  source: ExtractionSourcePort,
  store: StorePort,
  options: RunExtractionOptions = {},
): Promise<RunExtractionResult> {
  const preferredLang = options.preferredLang ?? null;
  const now = options.now ?? (() => new Date().toISOString());

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

  const startedAt = now();
  let record = createRunRecord({
    externalId: identity.externalId,
    dirName: finalSlug,
    selectedTrack: track.sourceKey,
    createdAt: startedAt,
    updatedAt: startedAt,
    steps: {
      metadata_fetched: "complete",
      // Neither has an implementation yet. Left pending they would strand every
      // run short of finished, since resume treats only pending as unfinished.
      thumbnail_downloaded: "skipped",
      prompt_generated: "skipped",
    },
  });
  await store.saveRun(record);

  const { document } = await source.fetchCaptions(identity, track, workDir);
  record = withStep(record, "captions_downloaded", "complete", now());
  await store.saveRun(record);

  const chaptered = assignChapters(document.cues, metadata.chapters);
  const paragraphs = segmentParagraphs(chaptered);
  const markdown = renderTranscript(metadata, paragraphs);
  const artifact = await store.writeArtifact(workDir, "transcript.md", markdown);

  record = withStep(record, "transcript_normalized", "complete", now());
  await store.saveRun(record);

  // Composition, not I/O: the caller wants a path it can print.
  return { transcriptPath: path.join(workDir, artifact.relPath), record };
}
