import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseInfoJson } from "../../adapters/ytdlp/info-json.ts";
import { isVetaError } from "../errors/veta-error.ts";
import { baseSubtag, isOriginalMarker } from "./lang.ts";
import type { CaptionKind, CaptionTrack } from "./metadata.ts";
import { selectTrack } from "./track-selection.ts";

function track(
  sourceKey: string,
  kind: CaptionKind,
  isTranslation: boolean | null = false,
): CaptionTrack {
  return {
    sourceKey,
    baseLanguage: baseSubtag(sourceKey),
    kind,
    displayName: sourceKey.toUpperCase(),
    isOriginalMarker: isOriginalMarker(sourceKey),
    isTranslation,
  };
}

/** What the reference video actually offers: no manual tracks, 2 originals, N translations. */
const REFERENCE = [
  track("en", "asr"),
  track("en-orig", "asr"),
  track("es", "asr", true),
  track("fr", "asr", true),
  track("de", "asr", true),
];

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return isVetaError(error) ? error.code : `unexpected: ${String(error)}`;
  }
  return "did not throw";
}

describe("selectTrack, resolving automatically", () => {
  // EXT-04: never map iteration order. 155 of 157 keys on the reference video
  // are machine translations; picking one yields translation-of-ASR output.
  it("never returns a machine translation", () => {
    const { track: chosen } = selectTrack(REFERENCE, "en");
    expect(chosen.isTranslation).toBe(false);
  });

  // Both `en` and `en-orig` survive the translation filter, so the secondary
  // signal decides. There is no requested tag, so exact-key never applies.
  it("prefers the original marker when two untranslated tracks tie", () => {
    expect(selectTrack(REFERENCE, "en").track.sourceKey).toBe("en-orig");
  });

  it("warns that the transcript is speech recognition, not a translation", () => {
    expect(selectTrack(REFERENCE, "en").warnings).toEqual(["ASR_ONLY"]);
  });

  // EXT-03 and FR-4 rule 1.
  it("prefers a manual track in the original language above all", () => {
    const tracks = [...REFERENCE, track("en", "manual"), track("de", "manual")];
    const { track: chosen, warnings } = selectTrack(tracks, "en");
    expect(chosen).toMatchObject({ sourceKey: "en", kind: "manual" });
    expect(warnings).toEqual([]);
  });

  // FR-4 rule 2: any authored track beats speech recognition, even off-language.
  it("falls back to a manual track in another language before any ASR", () => {
    const tracks = [track("en", "asr"), track("de", "manual")];
    expect(selectTrack(tracks, "en").track).toMatchObject({ sourceKey: "de", kind: "manual" });
  });

  it("breaks a tie between equal candidates by key length, then alphabetically", () => {
    const tracks = [track("zzz", "manual"), track("de", "manual"), track("ab", "manual")];
    expect(selectTrack(tracks, null).track.sourceKey).toBe("ab");
  });

  it("keeps a track whose translation status is unknown, and says so", () => {
    const tracks = [track("en", "asr", null), track("es", "asr", true)];
    const { track: chosen, warnings } = selectTrack(tracks, "en");
    expect(chosen.sourceKey).toBe("en");
    expect(warnings).toContain("TRANSLATION_UNDETERMINED");
  });

  it("is deterministic regardless of the order tracks arrive in", () => {
    const forwards = selectTrack(REFERENCE, "en").track.sourceKey;
    const backwards = selectTrack([...REFERENCE].reverse(), "en").track.sourceKey;
    expect(backwards).toBe(forwards);
  });

  // The source did not report a spoken language and offers nothing authored,
  // so rules 1 and 3 cannot match. Guessing would be picking arbitrarily.
  it("refuses to guess when the spoken language is unknown", () => {
    const tracks = [track("en", "asr"), track("de", "asr")];
    expect(codeOf(() => selectTrack(tracks, null))).toBe("LANGUAGE_UNAVAILABLE");
  });

  it("still resolves with no spoken language when a manual track exists", () => {
    const tracks = [track("en", "asr"), track("de", "manual")];
    expect(selectTrack(tracks, null).track.sourceKey).toBe("de");
  });
});

describe("selectTrack, resolving an explicit request", () => {
  it("matches a request against the verbatim key", () => {
    expect(selectTrack(REFERENCE, "en", "en-orig").track.sourceKey).toBe("en-orig");
  });

  // An exact key match outranks the original marker: the user named it.
  it("honours an exact key request over the preferred default", () => {
    expect(selectTrack(REFERENCE, "en", "en").track.sourceKey).toBe("en");
  });

  it("matches a request against the normalized base subtag", () => {
    expect(selectTrack(REFERENCE, "en", "en-US").track.baseLanguage).toBe("en");
  });

  // FR-4 grants explicit selection, so a translation is honoured — loudly.
  it("allows a translated track but warns it is machine translated", () => {
    const { track: chosen, warnings } = selectTrack(REFERENCE, "en", "es");
    expect(chosen.sourceKey).toBe("es");
    expect(warnings).toEqual(["ASR_ONLY", "TRANSLATED_TRACK"]);
  });

  it("still prefers a manual track for the requested language", () => {
    const tracks = [track("de", "asr", true), track("de", "manual")];
    expect(selectTrack(tracks, "en", "de").track.kind).toBe("manual");
  });

  // EXT-06: never silently fall back to another language.
  it("fails when the requested language has no track at all", () => {
    expect(codeOf(() => selectTrack(REFERENCE, "en", "ja"))).toBe("LANGUAGE_UNAVAILABLE");
  });

  it("lists what is available when a request cannot be satisfied", () => {
    try {
      selectTrack(REFERENCE, "en", "ja");
      expect.unreachable();
    } catch (error) {
      expect(isVetaError(error) && error.message).toContain("en-orig");
      expect(isVetaError(error) && error.message).toContain("es");
    }
  });
});

// Synthetic tracks test the rules; this tests the rules against what YouTube
// actually returns, which is the only place a wrong assumption shows up.
describe("selectTrack, against the reference payload", () => {
  const metadata = parseInfoJson(
    JSON.parse(
      readFileSync(
        new URL("../../adapters/ytdlp/__fixtures__/info.json", import.meta.url),
        "utf8",
      ),
    ),
  );

  it("lands on the original ASR track, not a translation of it", () => {
    const { track: chosen, warnings } = selectTrack(
      metadata.captionTracks,
      metadata.originalLanguage,
    );
    expect(chosen).toMatchObject({ sourceKey: "en-orig", kind: "asr", isTranslation: false });
    expect(warnings).toEqual(["ASR_ONLY"]);
  });

  it("resolves every offered language without crashing", () => {
    for (const offered of metadata.captionTracks) {
      const { track: chosen } = selectTrack(
        metadata.captionTracks,
        metadata.originalLanguage,
        offered.sourceKey,
      );
      expect(chosen.sourceKey).toBe(offered.sourceKey);
    }
  });
});

describe("selectTrack, with nothing to choose from", () => {
  // EXT-06: a distinct, actionable failure, not an empty transcript.
  it("fails when the video has no captions in any language", () => {
    expect(codeOf(() => selectTrack([], "en"))).toBe("NO_CAPTIONS");
    expect(codeOf(() => selectTrack([], "en", "en"))).toBe("NO_CAPTIONS");
  });

  it("fails when every available track is a translation", () => {
    const tracks = [track("es", "asr", true), track("fr", "asr", true)];
    expect(codeOf(() => selectTrack(tracks, "en"))).toBe("NO_CAPTIONS");
  });
});
