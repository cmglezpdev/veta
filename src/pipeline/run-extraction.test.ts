import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FsStore } from "../adapters/store/fs-store.ts";
import { resetBinaryCache } from "../adapters/ytdlp/binary.ts";
import { YtDlpExtractionSource } from "../adapters/ytdlp/ytdlp-extraction-source.ts";
import { parseRunRecord, type RunRecord } from "../domain/run/run-record.ts";
import { runExtraction } from "./run-extraction.ts";

const FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../adapters/ytdlp/__fixtures__",
);
const INFO_FIXTURE = path.join(FIXTURES, "info.json");
const CAPTION_FIXTURE = path.join(FIXTURES, "captions.en.json3");

const VIDEO_ID = "1VqKUrxR2C8";
const PACKAGE_DIR = "building-opencode-with-dax-raad";

let root: string;
let dataDir: string;
let binary: string;
let previousBinaryPath: string | undefined;
let previousCaptionsFail: string | undefined;

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "veta-pipeline-"));
  dataDir = path.join(root, "out");
  binary = path.join(root, "yt-dlp");
  previousBinaryPath = process.env["VETA_YTDLP_PATH"];
  previousCaptionsFail = process.env["VETA_FAKE_CAPTIONS_FAIL"];

  // A real executable, not a double. `VETA_FAKE_CAPTIONS_FAIL` lets a test make
  // the caption fetch fail the way the network does — after metadata succeeded.
  const body = `#!/bin/sh
set -eu
output=''
language='en'
write_info=0
write_captions=0
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
  if [ -n "\${VETA_FAKE_CAPTIONS_FAIL:-}" ]; then
    printf '%s\\n' 'ERROR: unable to download video subtitles' >&2
    exit 1
  fi
  cp ${shellQuote(CAPTION_FIXTURE)} "$output.$language.json3"
fi
`;
  await writeFile(binary, body, "utf8");
  await chmod(binary, 0o755);
  process.env["VETA_YTDLP_PATH"] = binary;
  delete process.env["VETA_FAKE_CAPTIONS_FAIL"];
  resetBinaryCache();
});

afterEach(async () => {
  if (previousBinaryPath === undefined) delete process.env["VETA_YTDLP_PATH"];
  else process.env["VETA_YTDLP_PATH"] = previousBinaryPath;
  if (previousCaptionsFail === undefined) delete process.env["VETA_FAKE_CAPTIONS_FAIL"];
  else process.env["VETA_FAKE_CAPTIONS_FAIL"] = previousCaptionsFail;
  resetBinaryCache();
  await rm(root, { force: true, recursive: true });
});

function newStore(): FsStore {
  return new FsStore({ dataDir });
}

/** A clock that never repeats, so `updatedAt` proves each save was its own write. */
function tickingClock(): () => string {
  let tick = 0;
  return () => `2026-01-01T00:00:${String(tick++).padStart(2, "0")}.000Z`;
}

async function readState(dirName = PACKAGE_DIR): Promise<RunRecord> {
  const raw = await readFile(path.join(dataDir, dirName, "state.json"), "utf8");
  return parseRunRecord(JSON.parse(raw));
}

describe("runExtraction", () => {
  it("produces the same transcript the extract path always did", async () => {
    const result = await runExtraction(VIDEO_ID, new YtDlpExtractionSource(), newStore(), {
      now: tickingClock(),
    });

    expect(result.transcriptPath).toBe(path.join(dataDir, PACKAGE_DIR, "transcript.md"));

    const markdown = await readFile(result.transcriptPath, "utf8");
    expect(markdown.startsWith("# Building OpenCode with Dax Raad")).toBe(true);
    expect(markdown).toContain("## 1. Intro");
  });

  it("writes state.json inside the finished package, not the interim directory", async () => {
    await runExtraction(VIDEO_ID, new YtDlpExtractionSource(), newStore(), {
      now: tickingClock(),
    });

    expect(await readdir(dataDir)).toEqual(expect.arrayContaining([PACKAGE_DIR, "index.json"]));
    expect(await readdir(dataDir)).not.toContain("1vqkurxr2c8");
    expect(await readdir(path.join(dataDir, PACKAGE_DIR))).toContain("state.json");

    const record = await readState();
    expect(record.externalId).toBe(VIDEO_ID);
    expect(record.dirName).toBe(PACKAGE_DIR);
  });

  it("marks every step veta actually ran as complete", async () => {
    await runExtraction(VIDEO_ID, new YtDlpExtractionSource(), newStore(), {
      now: tickingClock(),
    });

    const record = await readState();
    expect(record.steps.metadata_fetched).toBe("complete");
    expect(record.steps.captions_downloaded).toBe("complete");
    expect(record.steps.transcript_normalized).toBe("complete");
  });

  it("marks the steps veta does not implement yet as skipped, not pending", async () => {
    // Left pending, these two would make `firstIncompleteStep` point at work
    // that never happens, and no run would ever reach a finished state.
    await runExtraction(VIDEO_ID, new YtDlpExtractionSource(), newStore(), {
      now: tickingClock(),
    });

    const record = await readState();
    expect(record.steps.thumbnail_downloaded).toBe("skipped");
    expect(record.steps.prompt_generated).toBe("skipped");
  });

  it("records the caption track key a resume would have to ask for again", async () => {
    await runExtraction(VIDEO_ID, new YtDlpExtractionSource(), newStore(), {
      now: tickingClock(),
    });

    expect((await readState()).selectedTrack).toBe("en-orig");
  });

  it("leaves the run findable by external id", async () => {
    await runExtraction(VIDEO_ID, new YtDlpExtractionSource(), newStore(), {
      now: tickingClock(),
    });

    const found = await newStore().findRun(VIDEO_ID);
    expect(found?.dirName).toBe(PACKAGE_DIR);
  });

  it("keeps what an interrupted run completed", async () => {
    // The whole point of the slice: a run that dies mid-flight leaves behind
    // enough to know it got past metadata and stopped at captions.
    process.env["VETA_FAKE_CAPTIONS_FAIL"] = "1";

    await expect(
      runExtraction(VIDEO_ID, new YtDlpExtractionSource(), newStore(), { now: tickingClock() }),
    ).rejects.toThrow();

    const record = await readState();
    expect(record.steps.metadata_fetched).toBe("complete");
    expect(record.steps.captions_downloaded).toBe("pending");
    expect(record.steps.transcript_normalized).toBe("pending");
  });

  it("advances updatedAt on every save while createdAt stays put", async () => {
    await runExtraction(VIDEO_ID, new YtDlpExtractionSource(), newStore(), {
      now: tickingClock(),
    });

    const record = await readState();
    expect(record.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(record.updatedAt > record.createdAt).toBe(true);
  });

  it("honours a preferred language the same way the extract path does", async () => {
    const result = await runExtraction(VIDEO_ID, new YtDlpExtractionSource(), newStore(), {
      preferredLang: "en",
      now: tickingClock(),
    });

    expect(result.transcriptPath.endsWith("transcript.md")).toBe(true);
    expect((await readState()).selectedTrack).toBe("en");
  });
});
