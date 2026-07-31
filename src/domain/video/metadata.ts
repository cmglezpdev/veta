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

/** Whether a caption track was written by a person or produced by speech recognition. */
export type CaptionKind = "manual" | "asr";

export type CaptionTrack = {
  /**
   * The source's own key for this track, verbatim — `en`, `en-orig`, `es-419`.
   *
   * Kept unnormalized on purpose: this is the string that must be handed back
   * to the source to fetch the track. Asking for the normalized `en` does not
   * get you the `en-orig` track.
   */
  readonly sourceKey: string;
  /** `sourceKey` reduced to its primary subtag, for comparison only. */
  readonly baseLanguage: string;
  readonly kind: CaptionKind;
  /** Localized display text from the source. Never pattern-matched by logic. */
  readonly displayName: string | null;
  /** Whether the key carries the source's original-language marker. */
  readonly isOriginalMarker: boolean;
  /**
   * Whether this track is a machine translation of another one.
   *
   * `null` means undeterminable — the signal the source normally carries was
   * missing or unreadable. That is deliberately distinct from `false`: an
   * unknown track stays eligible for selection, but it cannot be presented as
   * verified-original.
   */
  readonly isTranslation: boolean | null;
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
  /**
   * The language actually spoken in the video, as a base subtag, or `null`
   * when the source did not say. Drives default caption selection.
   */
  readonly originalLanguage: string | null;
  readonly captionTracks: readonly CaptionTrack[];
};
