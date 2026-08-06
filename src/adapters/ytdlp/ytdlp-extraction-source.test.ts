import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CaptionTrack } from "../../domain/video/metadata.ts";
import { asWorkDir } from "../../ports/extraction-source.ts";
import { resetBinaryCache } from "./binary.ts";
import { YtDlpExtractionSource } from "./ytdlp-extraction-source.ts";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "__fixtures__");
const INFO_FIXTURE = path.join(FIXTURES, "info.json");
const CAPTION_FIXTURE = path.join(FIXTURES, "captions.en.json3");

let root: string;
let binary: string;
let argsLog: string;
let previousBinaryPath: string | undefined;
let previousPath: string | undefined;

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "veta-source-"));
  binary = path.join(root, "yt-dlp");
  argsLog = path.join(root, "args.log");
  previousBinaryPath = process.env["VETA_YTDLP_PATH"];
  previousPath = process.env["PATH"];

  const body = `#!/bin/sh
set -eu
output=''
language='en'
write_info=0
write_captions=0
for arg in "$@"; do printf '%s\\n' "$arg" >> ${shellQuote(argsLog)}; done
while [ "$#" -gt 0 ]; do
  case "$1" in
    --version) printf '%s\\n' '2026.07.31'; exit 0 ;;
    --write-info-json) write_info=1 ;;
    --write-subs|--write-auto-subs) write_captions=1 ;;
    --sub-langs) shift; language="$1" ;;
    -o) shift; output="$1" ;;
  esac
  shift
done
if [ "$write_info" -eq 1 ]; then
  cp ${shellQuote(INFO_FIXTURE)} "$output.info.json"
fi
if [ "$write_captions" -eq 1 ]; then
  cp ${shellQuote(CAPTION_FIXTURE)} "$output.$language.json3"
fi
`;
  await writeFile(binary, body, "utf8");
  await chmod(binary, 0o755);
  process.env["VETA_YTDLP_PATH"] = binary;
  resetBinaryCache();
});

afterEach(async () => {
  if (previousBinaryPath === undefined) delete process.env["VETA_YTDLP_PATH"];
  else process.env["VETA_YTDLP_PATH"] = previousBinaryPath;
  if (previousPath === undefined) delete process.env["PATH"];
  else process.env["PATH"] = previousPath;
  resetBinaryCache();
  await rm(root, { force: true, recursive: true });
});

describe("YtDlpExtractionSource", () => {
  it.each([
    ["1VqKUrxR2C8", "1VqKUrxR2C8"],
    ["https://youtu.be/1VqKUrxR2C8?t=20", "1VqKUrxR2C8"],
    ["https://www.youtube.com/watch?v=1VqKUrxR2C8&list=abc", "1VqKUrxR2C8"],
    ["https://youtube.com/shorts/1VqKUrxR2C8", "1VqKUrxR2C8"],
  ])("identifies %s", async (input, externalId) => {
    const source = new YtDlpExtractionSource();

    await expect(source.identify(input)).resolves.toEqual({
      sourceId: "yt-dlp",
      externalId,
      canonicalUrl: `https://www.youtube.com/watch?v=${externalId}`,
    });
  });

  it("rejects non-YouTube input", async () => {
    const source = new YtDlpExtractionSource();

    await expect(source.identify("https://example.com/watch?v=1VqKUrxR2C8")).rejects.toMatchObject({
      code: "INPUT_UNRECOGNIZED",
    });
    await expect(source.identify("too-short")).rejects.toMatchObject({
      code: "INPUT_UNRECOGNIZED",
    });
  });

  it("fetches and parses metadata through the real fake executable", async () => {
    const source = new YtDlpExtractionSource();
    const workDir = asWorkDir(path.join(root, "work"));
    const identity = await source.identify("1VqKUrxR2C8");

    const result = await source.fetchMetadata(identity, workDir);

    expect(result.metadata).toMatchObject({
      id: "1VqKUrxR2C8",
      title: "Building OpenCode with Dax Raad",
    });
    expect(result.raw.relPath).toBe("raw/info.json");
    expect(result.raw.bytes).toBeGreaterThan(100);
    expect(await readFile(path.join(workDir, result.raw.relPath), "utf8")).toContain(
      '"id": "1VqKUrxR2C8"',
    );
  });

  it.each([
    ["asr", "--write-auto-subs"],
    ["manual", "--write-subs"],
  ] as const)("fetches and parses a %s caption track", async (kind, expectedFlag) => {
    const source = new YtDlpExtractionSource();
    const workDir = asWorkDir(path.join(root, `work-${kind}`));
    const identity = await source.identify("1VqKUrxR2C8");
    const track: CaptionTrack = {
      sourceKey: "en",
      baseLanguage: "en",
      kind,
      displayName: "English",
      isOriginalMarker: false,
      isTranslation: false,
    };

    const result = await source.fetchCaptions(identity, track, workDir);
    const invokedArgs = await readFile(argsLog, "utf8");

    // Sliced fixture: 50 content cues (see __fixtures__/FIXTURES.md).
    expect(result.document.cues.length).toBe(50);
    expect(result.document.clampCount).toBe(0);
    expect(result.raw.relPath).toBe("raw/captions.en.json3");
    expect(invokedArgs).toContain(expectedFlag);
    expect(invokedArgs).toContain("--sub-langs\nen");
    expect(invokedArgs).toContain("--sub-format\njson3");
    expect(invokedArgs).toContain("--socket-timeout\n30");
  });

  it("returns healthy binary details and never throws when resolution fails", async () => {
    const source = new YtDlpExtractionSource();

    await expect(source.health()).resolves.toMatchObject({
      sourceId: "yt-dlp",
      ready: true,
      details: expect.arrayContaining([
        { label: "source", value: "config" },
        { label: "version", value: "2026.07.31" },
      ]),
    });

    resetBinaryCache();
    process.env["VETA_YTDLP_PATH"] = path.join(root, "missing");
    process.env["PATH"] = "";
    const unavailable = await source.health();
    expect(unavailable.ready).toBe(false);
    expect(unavailable.summary).toMatch(/not ready/i);
  });

  it("defers thumbnail downloading to a later slice", async () => {
    const source = new YtDlpExtractionSource();
    const workDir = asWorkDir(path.join(root, "work-thumbnail"));
    const identity = await source.identify("1VqKUrxR2C8");
    const { metadata } = await source.fetchMetadata(identity, workDir);

    await expect(source.fetchThumbnail(metadata, workDir)).resolves.toBeNull();
  });

  it("loads metadata back from the raw file a fetch left behind", async () => {
    const source = new YtDlpExtractionSource();
    const workDir = asWorkDir(path.join(root, "work-load"));
    const identity = await source.identify("1VqKUrxR2C8");
    const fetched = await source.fetchMetadata(identity, workDir);

    const loaded = await source.loadMetadata(workDir);

    expect(loaded?.metadata).toEqual(fetched.metadata);
    expect(loaded?.raw).toEqual(fetched.raw);
  });

  it("returns null instead of guessing when there is no raw metadata", async () => {
    const source = new YtDlpExtractionSource();
    const workDir = asWorkDir(path.join(root, "work-empty"));

    await expect(source.loadMetadata(workDir)).resolves.toBeNull();
  });

  it("loads captions back from the raw file a fetch left behind", async () => {
    const source = new YtDlpExtractionSource();
    const workDir = asWorkDir(path.join(root, "work-load-captions"));
    const identity = await source.identify("1VqKUrxR2C8");
    const track: CaptionTrack = {
      sourceKey: "en",
      baseLanguage: "en",
      kind: "asr",
      displayName: "English",
      isOriginalMarker: false,
      isTranslation: false,
    };
    const fetched = await source.fetchCaptions(identity, track, workDir);

    const loaded = await source.loadCaptions(track, workDir);

    expect(loaded?.document).toEqual(fetched.document);
    expect(loaded?.raw).toEqual(fetched.raw);
  });

  it("returns null for a track never fetched and for a corrupt raw file", async () => {
    const source = new YtDlpExtractionSource();
    const workDir = asWorkDir(path.join(root, "work-load-miss"));
    const identity = await source.identify("1VqKUrxR2C8");
    const track: CaptionTrack = {
      sourceKey: "en",
      baseLanguage: "en",
      kind: "asr",
      displayName: "English",
      isOriginalMarker: false,
      isTranslation: false,
    };
    await source.fetchCaptions(identity, track, workDir);

    // A track whose raw file was never written has nothing to load.
    await expect(source.loadCaptions({ ...track, sourceKey: "fr" }, workDir)).resolves.toBeNull();

    // A truncated download is not a document; the caller must re-fetch.
    await writeFile(path.join(workDir, "raw", "captions.en.json3"), '{"events": [', "utf8");
    await expect(source.loadCaptions(track, workDir)).resolves.toBeNull();
  });
});
