/**
 * What we know about a video, independent of where it came from.
 *
 * These types live in `domain/` rather than beside the yt-dlp parser because
 * they describe the problem, not the wire format. A later ASR source will
 * populate the same shape from completely different fields, and rendering
 * must not have to care which one produced it.
 */

export type Chapter = {
  readonly title: string;
  readonly startSec: number;
  readonly endSec: number;
};

export type VideoMetadata = {
  readonly id: string;
  readonly title: string;
  readonly durationSec: number;
  readonly uploader: string | null;
  readonly thumbnailUrl: string | null;
  /** Used to build per-paragraph deep links. */
  readonly canonicalUrl: string | null;
  readonly chapters: readonly Chapter[];
};
