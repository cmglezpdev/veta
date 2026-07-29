/**
 * Where yt-dlp's vocabulary is allowed to appear.
 *
 * `tStartMs`, `start_time` and `automatic_captions` are YouTube's names for
 * YouTube's shapes. The moment one of them appears in `domain/`, the domain
 * has quietly taken on a second job — modelling a transcript AND tracking one
 * source's wire format — and a later ASR source has to either fake those
 * fields or force a rewrite.
 *
 * The layering test catches an import crossing a boundary. This catches the
 * subtler version: no import, just a field name copied by hand.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("../", import.meta.url));

/** The only directory allowed to speak yt-dlp. Its own tests included. */
const CONTAINED_IN = "adapters/ytdlp/";

const WIRE_TERMS = [
  "upload_date",
  "automatic_captions",
  "webpage_url",
  "start_time",
  "end_time",
  "tStartMs",
  "dDurationMs",
  "tOffsetMs",
  "segs",
  "wireMagic",
  "tlang",
] as const;

function typescriptFiles(): string[] {
  return readdirSync(SRC, { recursive: true, encoding: "utf8" })
    .filter((entry) => entry.endsWith(".ts"))
    .map((entry) => entry.split(path.sep).join("/"));
}

/** This file declares the terms, so it necessarily contains all of them. */
const SELF = "arch/vocabulary.test.ts";

describe("wire vocabulary containment", () => {
  const files = typescriptFiles().filter(
    (file) => !file.startsWith(CONTAINED_IN) && file !== SELF,
  );

  it("leaks no yt-dlp field name outside its adapter", () => {
    const leaks: string[] = [];

    for (const file of files) {
      const source = readFileSync(path.join(SRC, file), "utf8");
      for (const term of WIRE_TERMS) {
        if (new RegExp(`\\b${term}\\b`).test(source)) {
          leaks.push(`${file} mentions ${term}`);
        }
      }
    }

    expect(leaks).toEqual([]);
  });

  it("is still checking the terms the adapter actually uses", () => {
    // A guard against the list drifting into irrelevance: if none of these
    // names appear even in the adapter, the assertion above proves nothing.
    const adapter = typescriptFiles()
      .filter((file) => file.startsWith(CONTAINED_IN))
      .map((file) => readFileSync(path.join(SRC, file), "utf8"))
      .join("\n");

    const used = WIRE_TERMS.filter((term) => new RegExp(`\\b${term}\\b`).test(adapter));
    expect(used.length).toBeGreaterThanOrEqual(WIRE_TERMS.length / 2);
  });
});
