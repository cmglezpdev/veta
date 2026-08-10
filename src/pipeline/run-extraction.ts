import path from "node:path";
import { buildNotesPrompt } from "../domain/prompt/build-prompt.ts";
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
const PROMPT_FILE = "prompt.md";

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
  /**
   * Absolute path to the generated notes prompt, or `null` when the package
   * predates prompt generation — a finished run whose record marks the step
   * skipped has no prompt.md, and answering from disk must not invent one.
   */
  readonly promptPath: string | null;
  /** Run state as persisted by the final save. */
  readonly record: RunRecord;
};

/**
 * Drive one extraction, recording how far it got.
 *
 * Every step that finishes is written to the store before the next one starts,
 * so a run that dies mid-flight leaves behind an accurate account of itself
 * rather than nothing. Re-running the same video reads that account back:
 * a finished run answers from disk without touching the source, and an
 * unfinished one resumes inside its own directory — raw files the previous
 * run already downloaded are loaded back instead of fetched again, so only
 * the work that never happened costs network.
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
      // A package written before prompt generation existed has no prompt.md
      // (its record marks the step skipped). Answering from disk reports what
      // is actually there instead of rebuilding a finished run.
      const promptPath =
        (await store.readArtifact(workDir, PROMPT_FILE)) !== null
          ? path.join(workDir, PROMPT_FILE)
          : null;
      return { transcriptPath: path.join(workDir, TRANSCRIPT_FILE), promptPath, record: previous };
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
    // After a reset there is nothing to load; otherwise disk beats network.
    const loaded = force ? null : await source.loadMetadata(workDir);
    metadata =
      loaded !== null ? loaded.metadata : (await source.fetchMetadata(identity, workDir)).metadata;
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
      // No implementation yet. Left pending it would strand every run short of
      // finished, since resume treats only pending as unfinished.
      thumbnail_downloaded: "skipped",
    },
  });
  await store.saveRun(record);

  const loadedCaptions = previous !== null && !force ? await source.loadCaptions(track, workDir) : null;
  const document =
    loadedCaptions !== null
      ? loadedCaptions.document
      : (await source.fetchCaptions(identity, track, workDir)).document;
  record = withStep(record, "captions_downloaded", "complete", now());
  await store.saveRun(record);

  const chaptered = assignChapters(document.cues, metadata.chapters);
  const paragraphs = segmentParagraphs(chaptered);
  const markdown = renderTranscript(metadata, paragraphs);
  const artifact = await store.writeArtifact(workDir, TRANSCRIPT_FILE, markdown);

  record = withStep(record, "transcript_normalized", "complete", now());
  await store.saveRun(record);

  // The prompt speaks about the transcript, so it is written in the language
  // of the track that was actually downloaded — not the video's original one.
  const prompt = buildNotesPrompt(metadata, track.baseLanguage, {
    transcriptPath: path.join(workDir, artifact.relPath),
    packageName: dirName,
  });
  const promptArtifact = await store.writeArtifact(workDir, PROMPT_FILE, prompt);

  record = withStep(record, "prompt_generated", "complete", now());
  await store.saveRun(record);

  // Composition, not I/O: the caller wants paths it can print.
  return {
    transcriptPath: path.join(workDir, artifact.relPath),
    promptPath: path.join(workDir, promptArtifact.relPath),
    record,
  };
}
