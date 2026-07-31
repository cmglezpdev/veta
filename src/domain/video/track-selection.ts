/**
 * Choosing which caption track to download.
 *
 * This looks like a lookup and is not. The reference video offers 157
 * auto-caption languages, of which 155 are machine translations of the English
 * speech recognition output. Picking by map iteration order — which is what
 * "just take the first one" amounts to — yields a translation of a transcript,
 * degraded twice, with nothing in the output saying so.
 *
 * So resolution is a fixed, documented order over a filtered candidate set,
 * and every tie is broken deterministically.
 */
import { VetaError } from "../errors/veta-error.ts";
import type { CaptionTrack } from "./metadata.ts";
import { baseSubtag } from "./lang.ts";

export type TrackWarning =
  /** The chosen track is speech recognition output, not an authored one. */
  | "ASR_ONLY"
  /** The chosen track is a machine translation. Only reachable via explicit request. */
  | "TRANSLATED_TRACK"
  /** The source did not let us determine whether the track is a translation. */
  | "TRANSLATION_UNDETERMINED";

export type TrackSelection = {
  readonly track: CaptionTrack;
  readonly warnings: readonly TrackWarning[];
};

/**
 * Order candidates so the first is the one to use.
 *
 * `requested` participates because an exact key match on what the user typed
 * outranks everything else — if they asked for `en-orig` by name, that is the
 * track they get, not the one our heuristics prefer.
 */
function preferenceOrder(candidates: readonly CaptionTrack[], requested: string | null): CaptionTrack[] {
  return [...candidates].sort((a, b) => {
    if (requested !== null) {
      const exact = Number(b.sourceKey === requested) - Number(a.sourceKey === requested);
      if (exact !== 0) return exact;
    }
    const marker = Number(b.isOriginalMarker) - Number(a.isOriginalMarker);
    if (marker !== 0) return marker;

    const length = a.sourceKey.length - b.sourceKey.length;
    if (length !== 0) return length;

    return a.sourceKey.localeCompare(b.sourceKey);
  });
}

function describe(tracks: readonly CaptionTrack[]): string {
  return preferenceOrder(tracks, null)
    .map((t) => (t.displayName === null ? t.sourceKey : `${t.sourceKey} (${t.displayName})`))
    .join(", ");
}

function warningsFor(track: CaptionTrack): TrackWarning[] {
  const warnings: TrackWarning[] = [];
  if (track.kind === "asr") warnings.push("ASR_ONLY");
  if (track.isTranslation === true) warnings.push("TRANSLATED_TRACK");
  if (track.isTranslation === null) warnings.push("TRANSLATION_UNDETERMINED");
  return warnings;
}

/**
 * Resolve an explicitly requested language.
 *
 * A request is matched against both the verbatim key and the normalized base,
 * so `--lang en`, `--lang en-US` and `--lang en-orig` all find the English
 * tracks. A translated track IS honoured here — the user asked for it — but it
 * comes back carrying a warning.
 */
function selectRequested(tracks: readonly CaptionTrack[], requested: string): TrackSelection {
  const base = baseSubtag(requested);
  const matches = tracks.filter((t) => t.sourceKey === requested || t.baseLanguage === base);

  if (matches.length === 0) {
    throw new VetaError(
      "LANGUAGE_UNAVAILABLE",
      `No caption track for "${requested}". Available: ${describe(tracks)}.`,
    );
  }

  // EXT-03: a track someone wrote beats one a machine transcribed.
  const manual = matches.filter((t) => t.kind === "manual");
  const pool = manual.length > 0 ? manual : matches;
  const track = preferenceOrder(pool, requested)[0]!;

  return { track, warnings: warningsFor(track) };
}

/**
 * Resolve with no explicit request, per the fixed FR-4 order.
 *
 * Translations are removed from the candidate set first — automatic resolution
 * must never land on one. Tracks whose translation status could not be
 * determined stay in: they are not known to be translations, and excluding
 * them would turn a missing signal into a hard failure.
 */
function selectDefault(
  tracks: readonly CaptionTrack[],
  originalLanguage: string | null,
): TrackSelection {
  const eligible = tracks.filter((t) => t.isTranslation !== true);

  if (eligible.length === 0) {
    throw new VetaError(
      "NO_CAPTIONS",
      "Every caption track on this video is a machine translation, so there is no " +
        "original to normalize. Pass --lang to choose one anyway.",
    );
  }

  const inOriginal = (t: CaptionTrack): boolean =>
    originalLanguage !== null && t.baseLanguage === originalLanguage;

  const rules: readonly CaptionTrack[][] = [
    eligible.filter((t) => t.kind === "manual" && inOriginal(t)),
    eligible.filter((t) => t.kind === "manual"),
    eligible.filter((t) => t.kind === "asr" && inOriginal(t)),
  ];

  const pool = rules.find((candidates) => candidates.length > 0);
  if (pool === undefined) {
    // Reachable when the source did not report the spoken language and offers
    // no authored track: rules 1 and 3 cannot match, and rule 2 is empty. There
    // is no defensible default, so ask rather than guess.
    throw new VetaError(
      "LANGUAGE_UNAVAILABLE",
      "Could not determine which language this video is in. " +
        `Pass --lang to choose one of: ${describe(eligible)}.`,
    );
  }

  const track = preferenceOrder(pool, null)[0]!;
  return { track, warnings: warningsFor(track) };
}

/**
 * Pick the caption track to download.
 *
 * @param requested the user's `--lang`, or `null` to resolve automatically
 * @throws VetaError `NO_CAPTIONS` when the video has no tracks at all,
 *   `LANGUAGE_UNAVAILABLE` when a request cannot be satisfied
 */
export function selectTrack(
  tracks: readonly CaptionTrack[],
  originalLanguage: string | null,
  requested: string | null = null,
): TrackSelection {
  if (tracks.length === 0) {
    throw new VetaError(
      "NO_CAPTIONS",
      "This video has no captions in any language, so there is no transcript to build.",
    );
  }

  return requested === null
    ? selectDefault(tracks, originalLanguage)
    : selectRequested(tracks, requested);
}
