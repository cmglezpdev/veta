import { isRecord } from "../../domain/json.ts";
import type { CaptionCue, CaptionDocument } from "../../domain/transcript/cue.ts";

/**
 * The json3 wire format. Names here are YouTube's, and this file is the only
 * place in the codebase allowed to know them.
 */
type Json3Segment = {
  readonly utf8?: string;
  /** Offset from the event's start to this segment's onset. */
  readonly tOffsetMs?: number;
};

type Json3Event = {
  readonly tStartMs?: number;
  /** How long the caption stays on screen. Deliberately never read — see below. */
  readonly dDurationMs?: number;
  readonly segs?: readonly Json3Segment[];
};

/**
 * Turn a raw json3 payload into normalized cues.
 *
 * `dDurationMs` is present on every content event and is tempting to use as
 * the cue's end. It is the display window, which overlaps the following cue,
 * so using it makes every gap negative. The end of a cue is taken instead
 * from the onset of its last word.
 */
export function parseJson3(raw: unknown): CaptionDocument {
  if (!isRecord(raw) || !Array.isArray(raw["events"])) {
    throw new Error("json3 payload has no events array");
  }

  const parsed: CaptionCue[] = [];

  for (const event of raw["events"] as readonly Json3Event[]) {
    const segments = event.segs;
    if (!segments || segments.length === 0) continue;

    // Segments carry their own leading spacing, so they are concatenated
    // as-is. Joining them with a space would double every space.
    const rawText = segments.map((segment) => segment.utf8 ?? "").join("");
    const text = rawText.replace(/\s+/g, " ").trim();
    if (text === "") continue; // spacer event between captions

    const startMs = event.tStartMs ?? 0;

    let lastWordOffsetMs = 0;
    for (const segment of segments) {
      if ((segment.utf8 ?? "").trim() !== "") {
        lastWordOffsetMs = segment.tOffsetMs ?? 0;
      }
    }

    parsed.push({ startMs, endMs: startMs + lastWordOffsetMs, text });
  }

  // Guarantee monotonicity so nothing downstream has to defend against a
  // malformed payload, and count every correction as a drift signal.
  let clampCount = 0;
  const cues: CaptionCue[] = parsed.map((cue, i) => {
    const next = parsed[i + 1];
    const ceiling = next === undefined ? cue.endMs : Math.min(cue.endMs, next.startMs);
    const endMs = Math.max(ceiling, cue.startMs);
    if (endMs !== cue.endMs) clampCount += 1;
    return { ...cue, endMs };
  });

  return { cues, clampCount };
}
