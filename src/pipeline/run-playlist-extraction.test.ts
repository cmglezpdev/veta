import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FsStore } from "../adapters/store/fs-store.ts";
import { resetBinaryCache } from "../adapters/ytdlp/binary.ts";
import { YtDlpExtractionSource } from "../adapters/ytdlp/ytdlp-extraction-source.ts";
import { YtDlpPlaylistSource } from "../adapters/ytdlp/ytdlp-playlist-source.ts";
import type { ProgressEvent } from "./progress.ts";
import { runPlaylistExtraction, type RunPlaylistExtractionOptions } from "./run-playlist-extraction.ts";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "../adapters/ytdlp/__fixtures__");
const CAPTION_FIXTURE = path.join(FIXTURES, "captions.en.json3");

const PLAYLIST_URL = "https://www.youtube.com/playlist?list=PLtestplaylist01";

function member(id: string, title: string, duration: number | null) {
  return { _type: "url", id, title, url: `https://www.youtube.com/watch?v=${id}`, duration };
}

const MAIN_MEMBERS = [
  member("member1id01", "Playlist Member One", 120),
  member("member2id02", "Playlist Member Two", 130),
  member("member3id03", "[Private video]", null), // structurally unavailable (D5)
  member("member4id04", "Playlist Member Four", 140),
];
const ABORT_MEMBERS = [member("member1id01", "Playlist Member One", 120), member("brokenid001", "Broken Member", 90)];

let root: string;
let dataDir: string;
let binary: string;
let previousBinaryPath: string | undefined;
let previousFixture: string | undefined;
let previousMemberFail: string | undefined;
let previousMemberAbort: string | undefined;

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/**
 * A real executable, not a double. It answers `--flat-playlist -J` from
 * `VETA_FAKE_PLAYLIST_FIXTURE`, and per-member fetches from `info.<id>.json`
 * (task 4.1) keyed off the last `?v=` in the invoked url — the thumbnail
 * step is left unhandled on purpose: `fetchThumbnail` is best-effort and
 * degrades to "skipped" when nothing is produced, exactly as real yt-dlp
 * failing that step would. `VETA_FAKE_MEMBER_FAIL`/`_ABORT` fail a member
 * whose url contains the given substring, matching yt-dlp's own stderr shape
 * for a member failure vs. an abort-classified condition (D6).
 */
async function writeMainScript(): Promise<void> {
  const body = `#!/bin/sh
set -eu
output=''
language='en'
write_info=0
write_captions=0
flat=0
dump_json=0
url=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    --version) printf '%s\\n' '2026.07.31'; exit 0 ;;
    --flat-playlist) flat=1 ;;
    -J) dump_json=1 ;;
    --write-info-json) write_info=1 ;;
    --write-subs|--write-auto-subs) write_captions=1 ;;
    --sub-langs) shift; language="$1" ;;
    -o) shift; output="$1" ;;
    -*) ;;
    *) url="$1" ;;
  esac
  shift
done
if [ "$flat" -eq 1 ] && [ "$dump_json" -eq 1 ]; then
  cat "\${VETA_FAKE_PLAYLIST_FIXTURE:?}"
  exit 0
fi
if [ -n "\${VETA_FAKE_MEMBER_ABORT:-}" ]; then
  case "$url" in *"\${VETA_FAKE_MEMBER_ABORT}"*) printf '%s\\n' "ERROR: Sign in to confirm you're not a bot" >&2; exit 1 ;; esac
fi
if [ -n "\${VETA_FAKE_MEMBER_FAIL:-}" ]; then
  case "$url" in *"\${VETA_FAKE_MEMBER_FAIL}"*) printf '%s\\n' 'ERROR: Video unavailable' >&2; exit 1 ;; esac
fi
vid=\${url##*v=}
if [ "$write_info" -eq 1 ] && [ -f "${FIXTURES}/info.$vid.json" ]; then
  cp "${FIXTURES}/info.$vid.json" "$output.info.json"
fi
if [ "$write_captions" -eq 1 ]; then
  cp ${shellQuote(CAPTION_FIXTURE)} "$output.$language.json3"
fi
`;
  await writeFile(binary, body, "utf8");
  await chmod(binary, 0o755);
  resetBinaryCache();
}

/** Resolves but fails every fetch except listing — a resumed run always re-lists. */
async function sabotageFetches(): Promise<void> {
  const body = `#!/bin/sh
set -eu
case "$*" in
  *--version*) printf '%s\\n' '2026.07.31'; exit 0 ;;
  *--flat-playlist*) cat "\${VETA_FAKE_PLAYLIST_FIXTURE:?}"; exit 0 ;;
esac
exit 1
`;
  await writeFile(binary, body, "utf8");
  await chmod(binary, 0o755);
  resetBinaryCache();
}

async function writePlaylistFixture(title: string, members: readonly unknown[]): Promise<void> {
  const fixturePath = path.join(root, "playlist-fixture.json");
  await writeFile(fixturePath, JSON.stringify({ title, entries: members }), "utf8");
  process.env["VETA_FAKE_PLAYLIST_FIXTURE"] = fixturePath;
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "veta-playlist-pipeline-"));
  dataDir = path.join(root, "out");
  binary = path.join(root, "yt-dlp");
  previousBinaryPath = process.env["VETA_YTDLP_PATH"];
  previousFixture = process.env["VETA_FAKE_PLAYLIST_FIXTURE"];
  previousMemberFail = process.env["VETA_FAKE_MEMBER_FAIL"];
  previousMemberAbort = process.env["VETA_FAKE_MEMBER_ABORT"];

  await writeMainScript();
  process.env["VETA_YTDLP_PATH"] = binary;
  delete process.env["VETA_FAKE_MEMBER_FAIL"];
  delete process.env["VETA_FAKE_MEMBER_ABORT"];
  await writePlaylistFixture("Test Playlist", MAIN_MEMBERS);
  resetBinaryCache();
});

afterEach(async () => {
  if (previousBinaryPath === undefined) delete process.env["VETA_YTDLP_PATH"];
  else process.env["VETA_YTDLP_PATH"] = previousBinaryPath;
  if (previousFixture === undefined) delete process.env["VETA_FAKE_PLAYLIST_FIXTURE"];
  else process.env["VETA_FAKE_PLAYLIST_FIXTURE"] = previousFixture;
  if (previousMemberFail === undefined) delete process.env["VETA_FAKE_MEMBER_FAIL"];
  else process.env["VETA_FAKE_MEMBER_FAIL"] = previousMemberFail;
  if (previousMemberAbort === undefined) delete process.env["VETA_FAKE_MEMBER_ABORT"];
  else process.env["VETA_FAKE_MEMBER_ABORT"] = previousMemberAbort;
  resetBinaryCache();
  await rm(root, { force: true, recursive: true });
});

function tickingClock(day = "2026-01-01"): () => string {
  let tick = 0;
  return () => `${day}T00:00:${String(tick++).padStart(2, "0")}.000Z`;
}

function capture(): { readonly events: ProgressEvent[]; onProgress: (e: ProgressEvent) => void } {
  const events: ProgressEvent[] = [];
  return { events, onProgress: (event) => events.push(event) };
}

function run(options: RunPlaylistExtractionOptions = {}, store: FsStore = new FsStore({ dataDir })) {
  return runPlaylistExtraction(PLAYLIST_URL, new YtDlpPlaylistSource(), new YtDlpExtractionSource(), store, options);
}

describe("runPlaylistExtraction", () => {
  it("throws PLAYLIST_EMPTY and performs no extraction when the listing is empty", async () => {
    await writePlaylistFixture("Empty Playlist", []);

    await expect(run({ now: tickingClock() })).rejects.toMatchObject({ code: "PLAYLIST_EMPTY" });
  });

  it("continues past a failed or unavailable member and finishes the loop", async () => {
    process.env["VETA_FAKE_MEMBER_FAIL"] = "member2id02";
    const store = new FsStore({ dataDir });

    const result = await run({ now: tickingClock() }, store);

    expect(result.outcomes.map((o) => o.status)).toEqual(["extracted", "failed", "unavailable", "extracted"]);
    expect(result.outcomes[1]).toMatchObject({ status: "failed", errorCode: "VIDEO_UNAVAILABLE" });
    expect(result.outcomes[2]).toMatchObject({ status: "unavailable", dirName: null });
    // Failed and unavailable both count toward the gap the CLI (PR5) reports.
    expect(result.failedCount).toBe(2);

    const prompt = await readFile(result.promptPath, "utf8");
    expect(prompt).toContain("Not included");
    expect(prompt).toContain("Playlist Member Two");

    const record = await store.findPlaylist("PLtestplaylist01");
    expect(record?.members.map((m) => m.status)).toEqual(["extracted", "failed", "unavailable", "extracted"]);
  });

  it.each([
    ["without --force, resumes members already completed by a previous run", {}, true],
    ["with --force, re-extracts every member even though the run already finished", { force: true }, false],
  ])("%s", async (_label, secondOptions, sabotage) => {
    const store = new FsStore({ dataDir });
    const first = await run({ now: tickingClock() }, store);
    expect(first.failedCount).toBe(1); // only the structurally unavailable member
    if (sabotage) await sabotageFetches();

    const { events, onProgress } = capture();
    await run({ now: tickingClock("2026-02-02"), onProgress, ...secondOptions }, store);

    expect(events.some((e) => e.kind === "run:answered-from-disk")).toBe(sabotage);
  });

  it.each([
    ["a VetaError code that means stop (BOT_CHECK)", "member1id01", "BOT_CHECK"],
    ["a non-VetaError bug", null, null],
  ])("aborts the whole run on %s instead of recording a member failure", async (_label, abortNeedle, code) => {
    await writePlaylistFixture("Abort Playlist", ABORT_MEMBERS);
    if (abortNeedle !== null) process.env["VETA_FAKE_MEMBER_ABORT"] = abortNeedle;

    const rejection = expect(run({ now: tickingClock() })).rejects;
    await (code !== null ? rejection.toMatchObject({ code }) : rejection.toThrow());
    expect((await readdir(dataDir).catch(() => [])).some((d) => d.startsWith("pl-"))).toBe(false);
  });

  it("narrates identification, every member's turn, and the final tally in order", async () => {
    const { events, onProgress } = capture();

    await run({ now: tickingClock(), onProgress });

    expect(events[0]).toEqual({
      kind: "playlist:identified",
      title: "Test Playlist",
      totalCount: 4,
      selectedCount: 4,
    });
    expect(events.at(-1)).toEqual({ kind: "playlist:summary", extracted: 3, failed: 0, unavailable: 1 });

    const starts = events.filter((e) => e.kind === "playlist:member-start");
    expect(starts.map((e) => (e as { position: number }).position)).toEqual([1, 2, 3, 4]);

    // The unavailable member (position 3) never reaches runExtraction: its
    // start is immediately followed by its own done, no phase events between.
    const startIndex = events.indexOf(starts[2]!);
    expect(events[startIndex + 1]).toMatchObject({ kind: "playlist:member-done", outcome: "unavailable" });

    // onProgress forwards verbatim into runExtraction — one "identify" phase
    // per successfully processed (i.e. not-unavailable) member.
    const identifyStarts = events.filter((e) => e.kind === "phase:start" && e.phase === "identify");
    expect(identifyStarts).toHaveLength(3);
  });
});
