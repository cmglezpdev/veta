import type { CaptionDocument } from "../domain/transcript/cue.ts";
import type { CaptionTrack, VideoMetadata } from "../domain/video/metadata.ts";

export interface SourceIdentity {
  readonly sourceId: string;
  readonly externalId: string;
  readonly canonicalUrl: string | null;
}

export type WorkDir = string & { readonly __brand: "WorkDir" };

/**
 * Temporary bridge until StorePort owns work-directory validation and minting.
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
  health(): Promise<SourceHealth>;
}
