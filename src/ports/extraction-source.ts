import type { CaptionDocument } from "../domain/transcript/cue.ts";
import type { CaptionTrack, VideoMetadata } from "../domain/video/metadata.ts";

export interface SourceIdentity {
  readonly sourceId: string;
  readonly externalId: string;
  readonly canonicalUrl: string | null;
}

export type WorkDir = string & { readonly __brand: "WorkDir" };

/**
 * Test-only WorkDir minting helper.
 *
 * Production code must obtain `WorkDir` values through {@link StorePort.openWorkDir}
 * in `adapters/store/fs-store.ts`. Import `asWorkDir` only from `*.test.ts` files
 * or the fs-store adapter — not from CLI, pipeline, or other production modules.
 */
export function asWorkDir(path: string): WorkDir {
  return path as WorkDir;
}

export interface RawArtifact {
  readonly relPath: string;
  readonly bytes: number;
}

export interface SourceHealth {
  readonly sourceId: string;
  readonly ready: boolean;
  readonly summary: string;
  readonly details: ReadonlyArray<{ readonly label: string; readonly value: string }>;
  readonly warnings: ReadonlyArray<{ readonly code: string; readonly message: string }>;
}

export interface ExtractionSourcePort {
  readonly sourceId: string;
  identify(input: string): Promise<SourceIdentity>;
  fetchMetadata(
    id: SourceIdentity,
    workDir: WorkDir,
  ): Promise<{ readonly metadata: VideoMetadata; readonly raw: RawArtifact }>;
  fetchThumbnail(
    metadata: VideoMetadata,
    workDir: WorkDir,
  ): Promise<{ readonly file: RawArtifact } | null>;
  fetchCaptions(
    id: SourceIdentity,
    track: CaptionTrack,
    workDir: WorkDir,
  ): Promise<{ readonly document: CaptionDocument; readonly raw: RawArtifact }>;
  /**
   * Read back what an earlier `fetchMetadata` left in the work dir, without
   * the network. Null means missing or unusable — the caller falls back to
   * fetching; it never means "the video has no metadata".
   */
  loadMetadata(
    workDir: WorkDir,
  ): Promise<{ readonly metadata: VideoMetadata; readonly raw: RawArtifact } | null>;
  /** Same contract as {@link loadMetadata}, for one caption track's raw file. */
  loadCaptions(
    track: CaptionTrack,
    workDir: WorkDir,
  ): Promise<{ readonly document: CaptionDocument; readonly raw: RawArtifact } | null>;
  health(): Promise<SourceHealth>;
}
