/**
 * Parsing of yt-dlp's `--write-info-json` payload. Along with `json3.ts`,
 * this is the only place in the codebase that knows yt-dlp's field names.
 */
import { asNumber, asString, isRecord } from "../../domain/json.ts";
import type { Chapter, VideoMetadata } from "../../domain/video/metadata.ts";

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

  return {
    id,
    title,
    durationSec,
    uploader: asString(raw["uploader"]),
    thumbnailUrl: asString(raw["thumbnail"]),
    canonicalUrl: asString(raw["webpage_url"]),
    chapters: parseChapters(raw["chapters"], durationSec),
  };
}
