import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FsStore } from "../adapters/store/fs-store.ts";
import { resetBinaryCache } from "../adapters/ytdlp/binary.ts";
import { YtDlpExtractionSource } from "../adapters/ytdlp/ytdlp-extraction-source.ts";
import { YtDlpPlaylistSource } from "../adapters/ytdlp/ytdlp-playlist-source.ts";
import { isVetaError } from "../domain/errors/veta-error.ts";
import { extractPlaylist } from "./extract-playlist.ts";
import { createProgressRenderer } from "./render/progress-renderer.ts";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "../adapters/ytdlp/__fixtures__");
const CAPTION_FIXTURE = path.join(FIXTURES, "captions.en.json3");
const PLAYLIST_URL = "https://www.youtube.com/playlist?list=PLtestplaylist02";

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function member(id: string, title: string): { readonly _type: "url"; readonly id: string; readonly title: string; readonly url: string; readonly duration: number } {
  return { _type: "url", id, title, url: `https://www.youtube.com/watch?v=${id}`, duration: 100 };
}

let root: string;
let dataDir: string;
let binary: string;
let previousBinaryPath: string | undefined;
let previousFixture: string | undefined;
let previousMemberFail: string | undefined;

/**
 * A real executable, not a double: answers `--flat-playlist -J` listing from
 * `VETA_FAKE_PLAYLIST_FIXTURE`, and per-member fetches from the existing
 * `info.<id>.json` fixtures (created for PR4), keyed off the last `?v=` in
 * the invoked url. `VETA_FAKE_MEMBER_FAIL` fails a member whose url contains
 * the given substring.
 */
async function writeScript(): Promise<void> {
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

async function writePlaylistFixture(title: string, members: readonly unknown[]): Promise<void> {
  const fixturePath = path.join(root, "playlist-fixture.json");
  await writeFile(fixturePath, JSON.stringify({ title, entries: members }), "utf8");
  process.env["VETA_FAKE_PLAYLIST_FIXTURE"] = fixturePath;
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "veta-extract-playlist-"));
  dataDir = path.join(root, "out");
  binary = path.join(root, "yt-dlp");
  previousBinaryPath = process.env["VETA_YTDLP_PATH"];
  previousFixture = process.env["VETA_FAKE_PLAYLIST_FIXTURE"];
  previousMemberFail = process.env["VETA_FAKE_MEMBER_FAIL"];

  await writeScript();
  process.env["VETA_YTDLP_PATH"] = binary;
  delete process.env["VETA_FAKE_MEMBER_FAIL"];
  await writePlaylistFixture("Test Playlist", [
    member("member1id01", "Playlist Member One"),
    member("member4id04", "Playlist Member Four"),
  ]);
  resetBinaryCache();
});

afterEach(async () => {
  if (previousBinaryPath === undefined) delete process.env["VETA_YTDLP_PATH"];
  else process.env["VETA_YTDLP_PATH"] = previousBinaryPath;
  if (previousFixture === undefined) delete process.env["VETA_FAKE_PLAYLIST_FIXTURE"];
  else process.env["VETA_FAKE_PLAYLIST_FIXTURE"] = previousFixture;
  if (previousMemberFail === undefined) delete process.env["VETA_FAKE_MEMBER_FAIL"];
  else process.env["VETA_FAKE_MEMBER_FAIL"] = previousMemberFail;
  resetBinaryCache();
  await rm(root, { force: true, recursive: true });
});

function streams(): { stdout: PassThrough; stderr: PassThrough; read(stream: PassThrough): string } {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  return {
    stdout,
    stderr,
    read: (stream) => {
      stream.end();
      return (stream.read() as Buffer | null)?.toString("utf8") ?? "";
    },
  };
}

function newStore(): FsStore {
  return new FsStore({ dataDir });
}

describe("extractPlaylist", () => {
  it("prints exactly one stdout line: the absolute prompt.md path", async () => {
    const { stdout, stderr, read } = streams();

    const result = await extractPlaylist(
      PLAYLIST_URL,
      new YtDlpPlaylistSource(),
      new YtDlpExtractionSource(),
      newStore(),
      stdout,
      stderr,
    );

    const lines = read(stdout).split("\n").filter((line) => line.length > 0);
    expect(lines).toEqual([result.promptPath]);
    expect(result.promptPath.endsWith("prompt.md")).toBe(true);
  });

  it("prints the prompt path before throwing PLAYLIST_PARTIAL_FAILURE, and lists failed members on stderr", async () => {
    process.env["VETA_FAKE_MEMBER_FAIL"] = "member4id04";
    const { stdout, stderr, read } = streams();

    let code = "no-throw";
    try {
      await extractPlaylist(
        PLAYLIST_URL,
        new YtDlpPlaylistSource(),
        new YtDlpExtractionSource(),
        newStore(),
        stdout,
        stderr,
      );
    } catch (error) {
      code = isVetaError(error) ? error.code : `not-a-veta-error: ${String(error)}`;
    }

    expect(code).toBe("PLAYLIST_PARTIAL_FAILURE");
    const stdoutLines = read(stdout).split("\n").filter((line) => line.length > 0);
    expect(stdoutLines).toHaveLength(1); // still exactly one line, printed before the throw
    expect(read(stderr)).toContain("Playlist Member Four");
  });

  it("passes the member selection through: [k/n] counts the selection, positions stay original", async () => {
    const { stdout, stderr, read } = streams();
    const renderer = createProgressRenderer(stderr, { isTTY: false });

    await extractPlaylist(
      PLAYLIST_URL,
      new YtDlpPlaylistSource(),
      new YtDlpExtractionSource(),
      newStore(),
      stdout,
      stderr,
      {
        onProgress: renderer.onEvent,
        selection: { only: [{ start: 2, end: 2 }], skipOnly: null, skip: 0, limit: null },
      },
    );

    const text = read(stderr);
    expect(text).toContain("1/2 member(s)");
    expect(text).toContain("[1/1] Playlist Member Four");
    expect(text).not.toContain("Playlist Member One");
  });

  it("shows a [k/n] <title> prefix on stderr during each member's turn, via a real renderer", async () => {
    const { stdout, stderr, read } = streams();
    const renderer = createProgressRenderer(stderr, { isTTY: false });

    await extractPlaylist(
      PLAYLIST_URL,
      new YtDlpPlaylistSource(),
      new YtDlpExtractionSource(),
      newStore(),
      stdout,
      stderr,
      { onProgress: renderer.onEvent },
    );

    const text = read(stderr);
    expect(text).toContain("[1/2] Playlist Member One");
    expect(text).toContain("[2/2] Playlist Member Four");
  });
});
