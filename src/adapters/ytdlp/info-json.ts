/**
 * Parsing of yt-dlp's `--write-info-json` payload. Along with `json3.ts`,
 * this is the only place in the codebase that knows yt-dlp's field names.
 */
import { asNumber, asString, isRecord } from "../../domain/json.ts";
import { baseSubtag, isOriginalMarker } from "../../domain/video/lang.ts";
import type {
  CaptionKind,
  CaptionTrack,
  Chapter,
  VideoMetadata,
} from "../../domain/video/metadata.ts";

function parseChapters(value: unknown, durationSec: number): Chapter[] {
  if (!Array.isArray(value)) return [];

  const chapters: Chapter[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const startSec = asNumber(entry["start_time"]);
    if (startSec === null) continue;
    chapters.push({
      title: asString(entry["title"]) ?? "Untitled",
      startSec,
      endSec: asNumber(entry["end_time"]) ?? durationSec,
    });
  }

  // Sorted defensively: nothing guarantees the source ordering, and every
  // consumer assumes chapters ascend.
  return chapters.sort((a, b) => a.startSec - b.startSec);
}

/**
 * Whether a caption's media URL says the content is machine-translated.
 *
 * `tlang` is YouTube's own marker for "translate this track into that
 * language", so it states the property directly. The alternatives are worse in
 * ways worth recording: the display name contains "(Original)" only because the
 * request carried `hl=en`, and matching it breaks under a different interface
 * locale; the `-orig` key suffix identifies the original track but cannot tell
 * you that `es` is a translation of it.
 *
 * Returns `null` rather than a guess when the URL is missing or unparseable —
 * see `CaptionTrack.isTranslation`.
 */
function detectTranslation(formats: readonly unknown[]): boolean | null {
  for (const format of formats) {
    if (!isRecord(format)) continue;
    const url = asString(format["url"]);
    if (url === null) continue;
    try {
      return new URL(url).searchParams.has("tlang");
    } catch {
      // A URL we cannot parse tells us nothing; keep looking at the others.
    }
  }
  return null;
}

function displayNameOf(formats: readonly unknown[]): string | null {
  for (const format of formats) {
    if (isRecord(format)) {
      const name = asString(format["name"]);
      if (name !== null) return name;
    }
  }
  return null;
}

/** Flatten one of yt-dlp's caption maps into tracks. */
function parseCaptionMap(value: unknown, kind: CaptionKind): CaptionTrack[] {
  if (!isRecord(value)) return [];

  const tracks: CaptionTrack[] = [];
  for (const [sourceKey, formats] of Object.entries(value)) {
    if (!Array.isArray(formats)) continue;
    tracks.push({
      sourceKey,
      baseLanguage: baseSubtag(sourceKey),
      kind,
      displayName: displayNameOf(formats),
      isOriginalMarker: isOriginalMarker(sourceKey),
      isTranslation: detectTranslation(formats),
    });
  }
  return tracks;
}

export function parseInfoJson(raw: unknown): VideoMetadata {
  if (!isRecord(raw)) {
    throw new Error("info.json payload is not an object");
  }

  const id = asString(raw["id"]);
  const title = asString(raw["title"]);
  if (id === null || title === null) {
    // A payload missing these is a shape change upstream, not a video we can
    // partially handle.
    throw new Error("info.json is missing id or title");
  }

  const durationSec = asNumber(raw["duration"]) ?? 0;
  const language = asString(raw["language"]);

  return {
    id,
    title,
    durationSec,
    uploader: asString(raw["uploader"]),
    thumbnailUrl: asString(raw["thumbnail"]),
    canonicalUrl: asString(raw["webpage_url"]),
    chapters: parseChapters(raw["chapters"], durationSec),
    // A locale, normalized to a base subtag so it can be compared against
    // caption keys at all: `en-US` never equals `en`.
    originalLanguage: language === null ? null : baseSubtag(language),
    captionTracks: [
      ...parseCaptionMap(raw["subtitles"], "manual"),
      ...parseCaptionMap(raw["automatic_captions"], "asr"),
    ],
  };
}
