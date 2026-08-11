import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FsStore } from "../adapters/store/fs-store.ts";
import { resetBinaryCache } from "../adapters/ytdlp/binary.ts";
import { YtDlpExtractionSource } from "../adapters/ytdlp/ytdlp-extraction-source.ts";
import { parseRunRecord, type RunRecord } from "../domain/run/run-record.ts";
import type { ProgressEvent } from "./progress.ts";
import { runExtraction } from "./run-extraction.ts";

const FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../adapters/ytdlp/__fixtures__",
);
const INFO_FIXTURE = path.join(FIXTURES, "info.json");
const CAPTION_FIXTURE = path.join(FIXTURES, "captions.en.json3");
const THUMBNAIL_FIXTURE = path.join(FIXTURES, "thumbnail.png");

const VIDEO_ID = "1VqKUrxR2C8";
const PACKAGE_DIR = "building-opencode-with-dax-raad";

let root: string;
let dataDir: string;
let binary: string;
let previousBinaryPath: string | undefined;
let previousCaptionsFail: string | undefined;
let previousInfoFail: string | undefined;
let previousThumbnailFail: string | undefined;

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/**
 * Replace the fake yt-dlp with one that still resolves (`--version` answers)
 * but fails every fetch. A plain `exit 1` is not enough: a binary that flunks
 * its version check is discarded in favour of whatever `PATH` holds, and on a
 * machine with a real yt-dlp the test would quietly hit the network.
 */
async function sabotageFetches(): Promise<void> {
  const body = `#!/bin/sh
case "$*" in *--version*) printf '%s\\n' '2026.07.31'; exit 0 ;; esac
exit 1
`;
  await writeFile(binary, body, "utf8");
  await chmod(binary, 0o755);
  resetBinaryCache();
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "veta-pipeline-"));
  dataDir = path.join(root, "out");
  binary = path.join(root, "yt-dlp");
  previousBinaryPath = process.env["VETA_YTDLP_PATH"];
  previousCaptionsFail = process.env["VETA_FAKE_CAPTIONS_FAIL"];
  previousInfoFail = process.env["VETA_FAKE_INFO_FAIL"];
  previousThumbnailFail = process.env["VETA_FAKE_THUMBNAIL_FAIL"];

  // A real executable, not a double. `VETA_FAKE_CAPTIONS_FAIL`,
  // `VETA_FAKE_INFO_FAIL`, and `VETA_FAKE_THUMBNAIL_FAIL` let a test make any
  // fetch fail the way the network does, without touching what is already on
  // disk.
  const body = `#!/bin/sh
set -eu
output=''
language='en'
write_info=0
write_captions=0
write_thumbnail=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --version) printf '%s\\n' '2026.07.31'; exit 0 ;;
    --write-info-json) write_info=1 ;;
    --write-subs|--write-auto-subs) write_captions=1 ;;
    --write-thumbnail) write_thumbnail=1 ;;
    --sub-langs) shift; language="$1" ;;
    -o) shift; output="$1" ;;
  esac
  shift
done
if [ "$write_info" -eq 1 ]; then
  if [ -n "\${VETA_FAKE_INFO_FAIL:-}" ]; then
    printf '%s\\n' 'ERROR: unable to download webpage' >&2
    exit 1
  fi
  cp ${shellQuote(INFO_FIXTURE)} "$output.info.json"
fi
if [ "$write_captions" -eq 1 ]; then
  if [ -n "\${VETA_FAKE_CAPTIONS_FAIL:-}" ]; then
    printf '%s\\n' 'ERROR: unable to download video subtitles' >&2
    exit 1
  fi
  cp ${shellQuote(CAPTION_FIXTURE)} "$output.$language.json3"
fi
if [ "$write_thumbnail" -eq 1 ]; then
  if [ -n "\${VETA_FAKE_THUMBNAIL_FAIL:-}" ]; then
    printf '%s\\n' 'ERROR: unable to download thumbnail' >&2
    exit 1
  fi
  cp ${shellQuote(THUMBNAIL_FIXTURE)} "\${output#thumbnail:}.png"
fi
`;
  await writeFile(binary, body, "utf8");
  await chmod(binary, 0o755);
  process.env["VETA_YTDLP_PATH"] = binary;
  delete process.env["VETA_FAKE_CAPTIONS_FAIL"];
  delete process.env["VETA_FAKE_INFO_FAIL"];
  delete process.env["VETA_FAKE_THUMBNAIL_FAIL"];
  resetBinaryCache();
});

afterEach(async () => {
  if (previousBinaryPath === undefined) delete process.env["VETA_YTDLP_PATH"];
  else process.env["VETA_YTDLP_PATH"] = previousBinaryPath;
  if (previousCaptionsFail === undefined) delete process.env["VETA_FAKE_CAPTIONS_FAIL"];
  else process.env["VETA_FAKE_CAPTIONS_FAIL"] = previousCaptionsFail;
  if (previousInfoFail === undefined) delete process.env["VETA_FAKE_INFO_FAIL"];
  else process.env["VETA_FAKE_INFO_FAIL"] = previousInfoFail;
  if (previousThumbnailFail === undefined) delete process.env["VETA_FAKE_THUMBNAIL_FAIL"];
  else process.env["VETA_FAKE_THUMBNAIL_FAIL"] = previousThumbnailFail;
  resetBinaryCache();
  await rm(root, { force: true, recursive: true });
});

function newStore(): FsStore {
  return new FsStore({ dataDir });
}

/** A clock that never repeats, so `updatedAt` proves each save was its own write. */
function tickingClock(day = "2026-01-01"): () => string {
  let tick = 0;
  return () => `${day}T00:00:${String(tick++).padStart(2, "0")}.000Z`;
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

  it("downloads the thumbnail into the package and marks the step complete", async () => {
    await runExtraction(VIDEO_ID, new YtDlpExtractionSource(), newStore(), {
      now: tickingClock(),
    });

    const record = await readState();
    expect(record.steps.thumbnail_downloaded).toBe("complete");
    expect(await readdir(path.join(dataDir, PACKAGE_DIR))).toContain("cover.png");
  });

  it("skips the thumbnail instead of failing the run when the download fails", async () => {
    // The cover is a nicety, not a deliverable: a run that cannot get it
    // still owes the user a transcript. Skipped keeps the record honest
    // without stranding the run short of finished.
    process.env["VETA_FAKE_THUMBNAIL_FAIL"] = "1";

    const result = await runExtraction(VIDEO_ID, new YtDlpExtractionSource(), newStore(), {
      now: tickingClock(),
    });

    const record = await readState();
    expect(record.steps.thumbnail_downloaded).toBe("skipped");
    expect(record.steps.transcript_normalized).toBe("complete");
    expect(await readdir(path.join(dataDir, PACKAGE_DIR))).not.toContain("cover.png");
    expect(result.transcriptPath).toBe(path.join(dataDir, PACKAGE_DIR, "transcript.md"));
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

describe("runExtraction prompt generation", () => {
  it("writes prompt.md beside the transcript and records the step as complete", async () => {
    const result = await runExtraction(VIDEO_ID, new YtDlpExtractionSource(), newStore(), {
      now: tickingClock(),
    });

    expect(result.promptPath).toBe(path.join(dataDir, PACKAGE_DIR, "prompt.md"));

    const prompt = await readFile(result.promptPath!, "utf8");
    expect(prompt).toContain("Building OpenCode with Dax Raad");
    // The prompt points at the transcript where it actually lives and names
    // the notes folder after the package, so an assistant running anywhere
    // on the machine can find one and create the other.
    expect(prompt).toContain(path.join(dataDir, PACKAGE_DIR, "transcript.md"));
    expect(prompt).toContain(`${PACKAGE_DIR}/README.md`);
    // The cover made it into the package, so the prompt has the assistant
    // copy it too and embed it at the top of the README.
    expect(prompt).toContain(`${PACKAGE_DIR}/cover.png`);
    expect(prompt).toContain(path.join(dataDir, PACKAGE_DIR, "cover.png"));

    expect((await readState()).steps.prompt_generated).toBe("complete");
  });

  it("says nothing about a cover when the thumbnail was skipped", async () => {
    process.env["VETA_FAKE_THUMBNAIL_FAIL"] = "1";

    const result = await runExtraction(VIDEO_ID, new YtDlpExtractionSource(), newStore(), {
      now: tickingClock(),
    });

    const prompt = await readFile(result.promptPath!, "utf8");
    expect(prompt).not.toContain("cover.png");
    expect(prompt).not.toContain("cover image");
  });

  it("returns the existing prompt when a finished run answers from disk", async () => {
    const first = await runExtraction(VIDEO_ID, new YtDlpExtractionSource(), newStore(), {
      now: tickingClock(),
    });
    await sabotageFetches();

    const second = await runExtraction(VIDEO_ID, new YtDlpExtractionSource(), newStore(), {
      now: tickingClock("2026-02-02"),
    });

    expect(second.promptPath).toBe(first.promptPath);
  });

  it("leaves an old skipped-prompt package alone instead of regenerating it", async () => {
    // Packages written before this slice carry prompt_generated: "skipped" and
    // no prompt.md. They are finished runs: the short-circuit must answer with
    // a null prompt path, not quietly rebuild the package.
    await runExtraction(VIDEO_ID, new YtDlpExtractionSource(), newStore(), {
      now: tickingClock(),
    });

    const statePath = path.join(dataDir, PACKAGE_DIR, "state.json");
    const legacy = JSON.parse(await readFile(statePath, "utf8"));
    legacy.steps.prompt_generated = "skipped";
    await writeFile(statePath, JSON.stringify(legacy), "utf8");
    await rm(path.join(dataDir, PACKAGE_DIR, "prompt.md"));

    // Any attempt to rebuild would need the source, so make every fetch fail.
    await sabotageFetches();

    const result = await runExtraction(VIDEO_ID, new YtDlpExtractionSource(), newStore(), {
      now: tickingClock("2026-02-02"),
    });

    expect(result.promptPath).toBeNull();
    expect(result.transcriptPath).toBe(path.join(dataDir, PACKAGE_DIR, "transcript.md"));
    expect(await readdir(path.join(dataDir, PACKAGE_DIR))).not.toContain("prompt.md");
  });
});

describe("runExtraction progress", () => {
  function capture(): { readonly events: ProgressEvent[]; onProgress: (e: ProgressEvent) => void } {
    const events: ProgressEvent[] = [];
    return { events, onProgress: (event) => events.push(event) };
  }

  it("narrates a fresh run start-to-finish, every phase fresh", async () => {
    const { events, onProgress } = capture();

    await runExtraction(VIDEO_ID, new YtDlpExtractionSource(), newStore(), {
      now: tickingClock(),
      onProgress,
    });

    expect(events).toEqual([
      { kind: "phase:start", phase: "identify" },
      { kind: "phase:done", phase: "identify", outcome: "fresh" },
      { kind: "phase:start", phase: "metadata" },
      { kind: "phase:done", phase: "metadata", outcome: "fresh" },
      // The facts arrive as data, in pipeline vocabulary: the renderer decides
      // how a duration or a track kind reads on screen.
      {
        kind: "video:identified",
        title: "Building OpenCode with Dax Raad",
        uploader: "The Pragmatic Engineer",
        durationSec: 4861,
      },
      { kind: "track:selected", language: "en", captionKind: "asr" },
      { kind: "phase:start", phase: "thumbnail" },
      { kind: "phase:done", phase: "thumbnail", outcome: "fresh" },
      { kind: "phase:start", phase: "captions" },
      { kind: "phase:done", phase: "captions", outcome: "fresh" },
      { kind: "phase:start", phase: "transcript" },
      { kind: "phase:done", phase: "transcript", outcome: "fresh" },
      { kind: "phase:start", phase: "prompt" },
      { kind: "phase:done", phase: "prompt", outcome: "fresh" },
    ]);
  });

  it("reports the resume and what came from disk instead of the network", async () => {
    const first = await runExtraction(VIDEO_ID, new YtDlpExtractionSource(), newStore(), {
      now: tickingClock(),
    });
    await rm(first.transcriptPath);
    // Every raw file survived, so the resumed run must load rather than fetch —
    // and say so. Sabotage proves "cached" is not just a label on a re-fetch.
    await sabotageFetches();

    const { events, onProgress } = capture();
    await runExtraction(VIDEO_ID, new YtDlpExtractionSource(), newStore(), {
      now: tickingClock("2026-02-02"),
      onProgress,
    });

    expect(events).toEqual([
      { kind: "phase:start", phase: "identify" },
      { kind: "phase:done", phase: "identify", outcome: "fresh" },
      { kind: "run:resumed", dirName: PACKAGE_DIR },
      { kind: "phase:start", phase: "metadata" },
      { kind: "phase:done", phase: "metadata", outcome: "cached" },
      // Cached metadata still identifies the video: the facts came from disk,
      // but the user watching this run has not seen them yet.
      {
        kind: "video:identified",
        title: "Building OpenCode with Dax Raad",
        uploader: "The Pragmatic Engineer",
        durationSec: 4861,
      },
      { kind: "track:selected", language: "en", captionKind: "asr" },
      { kind: "phase:start", phase: "thumbnail" },
      { kind: "phase:done", phase: "thumbnail", outcome: "fresh" },
      { kind: "phase:start", phase: "captions" },
      { kind: "phase:done", phase: "captions", outcome: "cached" },
      { kind: "phase:start", phase: "transcript" },
      { kind: "phase:done", phase: "transcript", outcome: "fresh" },
      { kind: "phase:start", phase: "prompt" },
      { kind: "phase:done", phase: "prompt", outcome: "fresh" },
    ]);
  });

  it("says only that a finished run was answered from disk", async () => {
    await runExtraction(VIDEO_ID, new YtDlpExtractionSource(), newStore(), {
      now: tickingClock(),
    });

    const { events, onProgress } = capture();
    await runExtraction(VIDEO_ID, new YtDlpExtractionSource(), newStore(), {
      now: tickingClock("2026-02-02"),
      onProgress,
    });

    expect(events).toEqual([
      { kind: "phase:start", phase: "identify" },
      { kind: "phase:done", phase: "identify", outcome: "fresh" },
      { kind: "run:answered-from-disk", dirName: PACKAGE_DIR },
    ]);
  });

  it("reports a failed thumbnail as skipped, matching the record", async () => {
    process.env["VETA_FAKE_THUMBNAIL_FAIL"] = "1";

    const { events, onProgress } = capture();
    await runExtraction(VIDEO_ID, new YtDlpExtractionSource(), newStore(), {
      now: tickingClock(),
      onProgress,
    });

    expect(events).toContainEqual({ kind: "phase:done", phase: "thumbnail", outcome: "skipped" });
  });

  it("does not claim a resume under force, which disowns the previous run", async () => {
    await runExtraction(VIDEO_ID, new YtDlpExtractionSource(), newStore(), {
      now: tickingClock(),
    });

    const { events, onProgress } = capture();
    await runExtraction(VIDEO_ID, new YtDlpExtractionSource(), newStore(), {
      force: true,
      now: tickingClock("2027-03-03"),
      onProgress,
    });

    expect(events.map((event) => event.kind)).not.toContain("run:resumed");
    expect(events).toContainEqual({ kind: "phase:done", phase: "metadata", outcome: "fresh" });
  });
});

describe("runExtraction resume", () => {
  it("resumes into the same package after captions failed mid-run", async () => {
    process.env["VETA_FAKE_CAPTIONS_FAIL"] = "1";
    await expect(
      runExtraction(VIDEO_ID, new YtDlpExtractionSource(), newStore(), { now: tickingClock() }),
    ).rejects.toThrow();

    delete process.env["VETA_FAKE_CAPTIONS_FAIL"];
    const result = await runExtraction(VIDEO_ID, new YtDlpExtractionSource(), newStore(), {
      now: tickingClock("2026-02-02"),
    });

    expect(result.transcriptPath).toBe(path.join(dataDir, PACKAGE_DIR, "transcript.md"));
    expect((await readdir(dataDir)).sort()).toEqual([PACKAGE_DIR, "index.json"]);

    const record = await readState();
    expect(record.steps.captions_downloaded).toBe("complete");
    expect(record.steps.transcript_normalized).toBe("complete");
    // The run kept its birth date; only the progress stamps moved.
    expect(record.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(record.updatedAt.startsWith("2026-02-02")).toBe(true);
  });

  it("returns the finished transcript without invoking the source again", async () => {
    const first = await runExtraction(VIDEO_ID, new YtDlpExtractionSource(), newStore(), {
      now: tickingClock(),
    });

    // From here on any yt-dlp fetch fails, so a second success can only
    // mean the runner answered from what is already on disk.
    await sabotageFetches();

    const second = await runExtraction(VIDEO_ID, new YtDlpExtractionSource(), newStore(), {
      now: tickingClock("2026-02-02"),
    });

    expect(second.transcriptPath).toBe(first.transcriptPath);
    expect(second.record.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("rebuilds a deleted transcript from the raw files without touching the source", async () => {
    const first = await runExtraction(VIDEO_ID, new YtDlpExtractionSource(), newStore(), {
      now: tickingClock(),
    });
    await rm(first.transcriptPath);

    // The raw files are still in the package, so the rebuild must not need
    // yt-dlp at all — prove it by making every fetch fail.
    await sabotageFetches();

    const second = await runExtraction(VIDEO_ID, new YtDlpExtractionSource(), newStore(), {
      now: tickingClock("2026-02-02"),
    });

    expect(second.transcriptPath).toBe(first.transcriptPath);
    expect((await readFile(second.transcriptPath, "utf8")).length).toBeGreaterThan(0);
  });

  it("resumes without re-fetching the metadata a previous run already downloaded", async () => {
    process.env["VETA_FAKE_CAPTIONS_FAIL"] = "1";
    await expect(
      runExtraction(VIDEO_ID, new YtDlpExtractionSource(), newStore(), { now: tickingClock() }),
    ).rejects.toThrow();

    // raw/info.json survived the failed run; a resume that insisted on
    // re-downloading it would now die before ever reaching the captions.
    delete process.env["VETA_FAKE_CAPTIONS_FAIL"];
    process.env["VETA_FAKE_INFO_FAIL"] = "1";

    const result = await runExtraction(VIDEO_ID, new YtDlpExtractionSource(), newStore(), {
      now: tickingClock("2026-02-02"),
    });

    expect(result.transcriptPath).toBe(path.join(dataDir, PACKAGE_DIR, "transcript.md"));
    expect((await readState()).steps.captions_downloaded).toBe("complete");
  });

  it("starts over under force even when the run finished", async () => {
    await runExtraction(VIDEO_ID, new YtDlpExtractionSource(), newStore(), {
      now: tickingClock(),
    });
    // A file veta never writes must survive the reset; raw/ must not.
    await writeFile(path.join(dataDir, PACKAGE_DIR, "notes.txt"), "mine", "utf8");

    await runExtraction(VIDEO_ID, new YtDlpExtractionSource(), newStore(), {
      force: true,
      now: tickingClock("2027-03-03"),
    });

    const record = await readState();
    // A forced run disowns the old record instead of inheriting its birth date.
    expect(record.createdAt).toBe("2027-03-03T00:00:00.000Z");
    expect(await readdir(path.join(dataDir, PACKAGE_DIR))).toContain("notes.txt");
    expect(await readFile(path.join(dataDir, PACKAGE_DIR, "transcript.md"), "utf8")).toContain(
      "Building OpenCode",
    );
  });
});
