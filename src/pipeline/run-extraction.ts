import path from "node:path";
import { createRunRecord, type RunRecord, withStep } from "../domain/run/run-record.ts";
import { firstIncompleteStep } from "../domain/run/resume.ts";
import { assignChapters } from "../domain/transcript/chapters.ts";
import { renderTranscript } from "../domain/transcript/render.ts";
import { segmentParagraphs } from "../domain/transcript/segment.ts";
import type { VideoMetadata } from "../domain/video/metadata.ts";
import { slugify } from "../domain/video/slug.ts";
import { selectTrack } from "../domain/video/track-selection.ts";
import type { ExtractionSourcePort, WorkDir } from "../ports/extraction-source.ts";
import type { StorePort } from "../ports/store.ts";

const TRANSCRIPT_FILE = "transcript.md";

export type RunExtractionOptions = {
  /** `--lang` equivalent; null runs the FR-4 automatic rule. */
  readonly preferredLang?: string | null;
  /**
   * `--force` equivalent: discard prior progress and artifacts and re-extract.
   * The package directory itself survives — only names veta writes are reset.
   */
  readonly force?: boolean;
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
 * rather than nothing. Re-running the same video reads that account back:
 * a finished run answers from disk without touching the source, an unfinished
 * one re-runs inside its own directory instead of refusing with
 * `WORK_DIR_EXISTS`. What resume does not yet do is skip a download the
 * previous run completed — that needs the source to read its raw files back,
 * which is the next slice.
 *
 * A record found for this id also settles the collision question: the same
 * video reuses its directory, while a different video whose title slugs to a
 * taken name still refuses. On resume the recorded `dirName` is kept even if
 * the title changed upstream — the directory is the run's identity.
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
  const force = options.force ?? false;
  const now = options.now ?? (() => new Date().toISOString());

  const identity = await source.identify(input);
  const previous = await store.findRun(identity.externalId);

  if (previous !== null && !force && firstIncompleteStep(previous) === null) {
    const workDir = await store.openWorkDir(previous.dirName);
    if ((await store.readArtifact(workDir, TRANSCRIPT_FILE)) !== null) {
      return { transcriptPath: path.join(workDir, TRANSCRIPT_FILE), record: previous };
    }
    // Finished on paper but the transcript is gone; fall through and rebuild.
  }

  let workDir: WorkDir;
  let dirName: string;
  let metadata: VideoMetadata;

  if (previous !== null) {
    dirName = previous.dirName;
    workDir = await store.openWorkDir(dirName);
    if (force) {
      await store.resetWorkDir(workDir);
    }
    ({ metadata } = await source.fetchMetadata(identity, workDir));
  } else {
    // The title lives in the metadata, which yt-dlp writes *into* the package
    // directory — so the directory has to exist under a provisional name first.
    const interimSlug = slugify("", identity.externalId);
    workDir = await store.openWorkDir(interimSlug);

    ({ metadata } = await source.fetchMetadata(identity, workDir));

    dirName = slugify(metadata.title, identity.externalId);
    if (dirName !== interimSlug) {
      workDir = await store.renameWorkDir(workDir, dirName);
    }
  }

  const { track } = selectTrack(metadata.captionTracks, metadata.originalLanguage, preferredLang);

  const startedAt = now();
  let record = createRunRecord({
    externalId: identity.externalId,
    dirName,
    selectedTrack: track.sourceKey,
    // A resumed run keeps its birth date; a forced one disowns the old record.
    createdAt: previous !== null && !force ? previous.createdAt : startedAt,
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
  const artifact = await store.writeArtifact(workDir, TRANSCRIPT_FILE, markdown);

  record = withStep(record, "transcript_normalized", "complete", now());
  await store.saveRun(record);

  // Composition, not I/O: the caller wants a path it can print.
  return { transcriptPath: path.join(workDir, artifact.relPath), record };
}
