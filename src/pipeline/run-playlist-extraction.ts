import path from "node:path";
import { isVetaError, VetaError, type VetaErrorCode } from "../domain/errors/veta-error.ts";
import { memberFolderName, positionWidth } from "../domain/playlist/position.ts";
import { playlistDirName, playlistNotesDir } from "../domain/playlist/playlist-dir.ts";
import { buildPlaylistPrompt, type PlaylistPromptMember } from "../domain/prompt/build-playlist-prompt.ts";
import { createPlaylistRecord, type PlaylistMemberRecord, type PlaylistRecord } from "../domain/run/playlist-record.ts";
import type { ExtractionSourcePort } from "../ports/extraction-source.ts";
import type { PlaylistSourcePort } from "../ports/playlist-source.ts";
import type { StorePort } from "../ports/store.ts";
import type { ProgressListener } from "./progress.ts";
import { runExtraction, type RunExtractionOptions } from "./run-extraction.ts";

const PROMPT_FILE = "prompt.md";

/**
 * Codes that abort the whole run instead of being recorded per member (D6):
 * marching every remaining member into a rate limiter is hostile, and a
 * wrong path/root is a bug worth stopping for. A non-`VetaError` also
 * aborts — it is unmodeled, so it is rethrown rather than checked here.
 */
const ABORT_CODES: ReadonlySet<VetaErrorCode> = new Set([
  "YTDLP_NOT_FOUND",
  "BOT_CHECK",
  "RATE_LIMITED",
  "PATH_ESCAPE",
  "ROOT_OVERLAP",
]);

export type MemberOutcome = {
  readonly position: number;
  readonly externalId: string | null;
  readonly title: string | null;
  readonly status: "extracted" | "failed" | "unavailable";
  readonly dirName: string | null;
  readonly promptPath: string | null;
  /** "NN-<video-slug>" — non-null iff `status === "extracted"`. */
  readonly notesFolder: string | null;
  readonly errorCode: VetaErrorCode | null;
  readonly errorMessage: string | null;
};

export type RunPlaylistResult = {
  readonly promptPath: string;
  readonly record: PlaylistRecord;
  readonly outcomes: readonly MemberOutcome[];
  /** Members not extracted — failed or unavailable — never a throw (D10; see file docstring). */
  readonly failedCount: number;
};

export type RunPlaylistExtractionOptions = Pick<RunExtractionOptions, "force" | "now" | "onProgress">;

function watchUrl(externalId: string): string {
  return `https://www.youtube.com/watch?v=${externalId}`;
}

/**
 * Orchestrate a playlist end to end: list members, run the unmodified
 * single-video `runExtraction()` once per member, aggregate outcomes, and
 * write the playlist's own record and orchestrator `prompt.md`.
 *
 * Only {@link ABORT_CODES} (and any non-`VetaError`) stop the loop early;
 * every other member failure is recorded and the loop continues. This
 * function never throws `PLAYLIST_PARTIAL_FAILURE` itself — it returns
 * `failedCount` instead, so the CLI (PR5) can print the prompt path before
 * deciding to exit non-zero (D10).
 */
export async function runPlaylistExtraction(
  input: string,
  playlistSource: PlaylistSourcePort,
  source: ExtractionSourcePort,
  store: StorePort,
  options: RunPlaylistExtractionOptions = {},
): Promise<RunPlaylistResult> {
  const force = options.force ?? false;
  const now = options.now ?? (() => new Date().toISOString());
  const onProgress: ProgressListener = options.onProgress ?? (() => {});

  const identity = await playlistSource.identifyPlaylist(input);
  if (identity === null) {
    throw new VetaError("INPUT_UNRECOGNIZED", "Expected a YouTube playlist URL.");
  }

  const { title, members } = await playlistSource.listMembers(identity);
  if (members.length === 0) {
    throw new VetaError("PLAYLIST_EMPTY", "The playlist has no members.");
  }

  const dirName = playlistDirName(title, identity.playlistId);
  const notesDir = playlistNotesDir(title, identity.playlistId);
  const width = positionWidth(members.length);
  const total = members.length;

  onProgress({ kind: "playlist:identified", title, totalCount: total, selectedCount: total });

  const outcomes: MemberOutcome[] = [];

  for (const [index, member] of members.entries()) {
    onProgress({
      kind: "playlist:member-start",
      index: index + 1,
      total,
      position: member.position,
      externalId: member.externalId,
      title: member.title,
    });

    const outcome =
      member.availability === "unavailable" || member.externalId === null
        ? unavailableOutcome(member)
        : await extractMember(member, member.externalId, source, store, notesDir, width, { force, now, onProgress });

    outcomes.push(outcome);
    onProgress({
      kind: "playlist:member-done",
      index: index + 1,
      total,
      outcome: outcome.status,
      dirName: outcome.dirName,
      errorMessage: outcome.errorMessage,
    });
  }

  const tally = summarize(outcomes);
  onProgress({ kind: "playlist:summary", ...tally });

  const timestamp = now();
  const previous = await store.findPlaylist(identity.playlistId);
  const record = createPlaylistRecord({
    playlistId: identity.playlistId,
    dirName,
    title,
    totalCount: total,
    members: outcomes.map(toMemberRecord),
    createdAt: previous !== null ? previous.createdAt : timestamp,
    updatedAt: timestamp,
    steps: { members_resolved: "complete", members_extracted: "complete", prompt_generated: "complete" },
  });

  const prompt = buildPlaylistPrompt(title, outcomes.map(toPromptMember), {
    notesDir,
    playlistUrl: identity.canonicalUrl,
  });

  const workDir = await store.openWorkDir(dirName);
  const promptArtifact = await store.writeArtifact(workDir, PROMPT_FILE, prompt);
  await store.savePlaylist(record);

  return {
    promptPath: path.join(workDir, promptArtifact.relPath),
    record,
    outcomes,
    failedCount: tally.failed + tally.unavailable,
  };
}

type Member = Awaited<ReturnType<PlaylistSourcePort["listMembers"]>>["members"][number];

function unavailableOutcome(member: Member): MemberOutcome {
  return {
    position: member.position,
    externalId: member.externalId,
    title: member.title,
    status: "unavailable",
    dirName: null,
    promptPath: null,
    notesFolder: null,
    errorCode: null,
    errorMessage: "Member is unavailable (private, deleted, or unresolved).",
  };
}

async function extractMember(
  member: Member,
  externalId: string,
  source: ExtractionSourcePort,
  store: StorePort,
  notesDir: string,
  width: number,
  runOptions: Pick<RunExtractionOptions, "force" | "now" | "onProgress">,
): Promise<MemberOutcome> {
  try {
    const result = await runExtraction(member.canonicalUrl ?? watchUrl(externalId), source, store, {
      ...runOptions,
      packageName: (videoDirName) => `${notesDir}/${memberFolderName(member.position, width, videoDirName)}`,
    });
    return {
      position: member.position,
      externalId,
      title: member.title,
      status: "extracted",
      dirName: result.record.dirName,
      promptPath: result.promptPath,
      notesFolder: memberFolderName(member.position, width, result.record.dirName),
      errorCode: null,
      errorMessage: null,
    };
  } catch (error) {
    if (!isVetaError(error) || ABORT_CODES.has(error.code)) throw error;
    return {
      position: member.position,
      externalId,
      title: member.title,
      status: "failed",
      dirName: null,
      promptPath: null,
      notesFolder: null,
      errorCode: error.code,
      errorMessage: error.message,
    };
  }
}

function summarize(outcomes: readonly MemberOutcome[]): {
  extracted: number;
  failed: number;
  unavailable: number;
} {
  return {
    extracted: outcomes.filter((o) => o.status === "extracted").length,
    failed: outcomes.filter((o) => o.status === "failed").length,
    unavailable: outcomes.filter((o) => o.status === "unavailable").length,
  };
}

function toMemberRecord(outcome: MemberOutcome): PlaylistMemberRecord {
  return {
    position: outcome.position,
    externalId: outcome.externalId,
    dirName: outcome.dirName,
    status: outcome.status,
    errorCode: outcome.errorCode,
  };
}

function toPromptMember(outcome: MemberOutcome): PlaylistPromptMember {
  const ok = outcome.status === "extracted";
  return {
    position: outcome.position,
    title: outcome.title ?? `Video at position ${outcome.position}`,
    status: ok ? "ok" : outcome.status,
    promptPath: ok ? outcome.promptPath : null,
    notesFolder: ok ? outcome.notesFolder : null,
    failureReason: ok ? null : (outcome.errorMessage ?? "Extraction did not complete."),
  };
}
