import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetBinaryCache } from "./binary.ts";
import { YtDlpPlaylistSource } from "./ytdlp-playlist-source.ts";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "__fixtures__");
const PLAYLIST_FIXTURE = path.join(FIXTURES, "playlist.flat.json");
const OVERSIZED_FIXTURE = path.join(FIXTURES, "playlist.flat.oversized.json");

let root: string;
let binary: string;
let previousBinaryPath: string | undefined;
let previousFixture: string | undefined;
let previousFail: string | undefined;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "veta-playlist-source-"));
  binary = path.join(root, "yt-dlp");
  previousBinaryPath = process.env["VETA_YTDLP_PATH"];
  previousFixture = process.env["VETA_FAKE_PLAYLIST_FIXTURE"];
  previousFail = process.env["VETA_FAKE_PLAYLIST_FAIL"];

  // A real executable, not a double. `VETA_FAKE_PLAYLIST_FIXTURE` selects
  // which captured/synthetic `-J` payload to answer with;
  // `VETA_FAKE_PLAYLIST_FAIL` makes the listing fail the way yt-dlp does for
  // a nonexistent playlist.
  const body = `#!/bin/sh
set -eu
flat=0
dump_json=0
for arg in "$@"; do
  case "$arg" in
    --version) printf '%s\\n' '2026.07.31'; exit 0 ;;
    --flat-playlist) flat=1 ;;
    -J) dump_json=1 ;;
  esac
done
if [ "$flat" -eq 1 ] && [ "$dump_json" -eq 1 ]; then
  if [ -n "\${VETA_FAKE_PLAYLIST_FAIL:-}" ]; then
    printf '%s\\n' 'ERROR: [youtube:tab] The playlist does not exist' >&2
    exit 1
  fi
  cat "\${VETA_FAKE_PLAYLIST_FIXTURE:?}"
  exit 0
fi
exit 1
`;
  await writeFile(binary, body, "utf8");
  await chmod(binary, 0o755);
  process.env["VETA_YTDLP_PATH"] = binary;
  process.env["VETA_FAKE_PLAYLIST_FIXTURE"] = PLAYLIST_FIXTURE;
  delete process.env["VETA_FAKE_PLAYLIST_FAIL"];
  resetBinaryCache();
});

afterEach(async () => {
  if (previousBinaryPath === undefined) delete process.env["VETA_YTDLP_PATH"];
  else process.env["VETA_YTDLP_PATH"] = previousBinaryPath;
  if (previousFixture === undefined) delete process.env["VETA_FAKE_PLAYLIST_FIXTURE"];
  else process.env["VETA_FAKE_PLAYLIST_FIXTURE"] = previousFixture;
  if (previousFail === undefined) delete process.env["VETA_FAKE_PLAYLIST_FAIL"];
  else process.env["VETA_FAKE_PLAYLIST_FAIL"] = previousFail;
  resetBinaryCache();
  await rm(root, { force: true, recursive: true });
});

describe("YtDlpPlaylistSource.identifyPlaylist", () => {
  it("recognizes a playlist?list= URL", async () => {
    const source = new YtDlpPlaylistSource();

    await expect(
      source.identifyPlaylist("https://www.youtube.com/playlist?list=PL123abc"),
    ).resolves.toEqual({
      sourceId: "yt-dlp",
      playlistId: "PL123abc",
      canonicalUrl: "https://www.youtube.com/playlist?list=PL123abc",
    });
  });

  it("returns null for a watch URL, with or without a list param, deferring to single-video", async () => {
    const source = new YtDlpPlaylistSource();

    await expect(
      source.identifyPlaylist("https://www.youtube.com/watch?v=abc12345678"),
    ).resolves.toBeNull();
    await expect(
      source.identifyPlaylist("https://www.youtube.com/watch?v=abc12345678&list=PL123abc"),
    ).resolves.toBeNull();
  });

  it("returns null for input that is not a URL at all", async () => {
    const source = new YtDlpPlaylistSource();

    await expect(source.identifyPlaylist("not-a-url")).resolves.toBeNull();
  });

  it.each([
    ["a radio mix", "https://www.youtube.com/playlist?list=RDCLAK5uy_kD8pDp"],
    ["Watch Later", "https://www.youtube.com/playlist?list=WL"],
    ["Liked Videos", "https://www.youtube.com/playlist?list=LL"],
  ])("rejects %s with INPUT_UNRECOGNIZED", async (_label, url) => {
    const source = new YtDlpPlaylistSource();

    await expect(source.identifyPlaylist(url)).rejects.toMatchObject({
      code: "INPUT_UNRECOGNIZED",
    });
  });

  // Threat matrix (a): an injected flag-looking `list=` value must be
  // rejected, not passed through to argv embedded in the built URL.
  it("rejects a list value that looks like an injected flag", async () => {
    const source = new YtDlpPlaylistSource();

    await expect(
      source.identifyPlaylist("https://www.youtube.com/playlist?list=--exec"),
    ).rejects.toMatchObject({ code: "INPUT_UNRECOGNIZED" });
  });

  // Threat matrix (b): path-escape-shaped list values must be rejected
  // before they reach argv or playlistDirName.
  it.each(["../etc/passwd", "PL/../secret", "PL;rm -rf"])(
    "rejects a list value containing a path or shell separator: %s",
    async (listValue) => {
      const source = new YtDlpPlaylistSource();

      await expect(
        source.identifyPlaylist(`https://www.youtube.com/playlist?list=${listValue}`),
      ).rejects.toMatchObject({ code: "INPUT_UNRECOGNIZED" });
    },
  );
});

describe("YtDlpPlaylistSource.listMembers", () => {
  it("parses the single -J JSON root, ordering members by array index, not playlist_index", async () => {
    const source = new YtDlpPlaylistSource();
    const identity = (await source.identifyPlaylist(
      "https://www.youtube.com/playlist?list=PL9omX6impEuMgDFCK_NleIB0sMzKs2boI",
    ))!;

    const result = await source.listMembers(identity);

    expect(result.title).toBe("LLM evaluation course");
    // -J entries carry no playlist_index (binding override, smoke test
    // #3645): position must come from array order, not a trusted field.
    expect(result.members.slice(0, 5).map((m) => m.position)).toEqual([1, 2, 3, 4, 5]);
    expect(result.members[0]).toEqual({
      position: 1,
      externalId: "rHs0sP7b5fM",
      title: "Welcome to the LLM evaluation course",
      canonicalUrl: "https://www.youtube.com/watch?v=rHs0sP7b5fM",
      availability: "available",
    });
  });

  it("marks a private/deleted entry unavailable, keeping its original position", async () => {
    const source = new YtDlpPlaylistSource();
    const identity = (await source.identifyPlaylist(
      "https://www.youtube.com/playlist?list=PL9omX6impEuMgDFCK_NleIB0sMzKs2boI",
    ))!;

    const result = await source.listMembers(identity);

    // The fixture appends [Private video] and [Deleted video] as members 6
    // and 7 (see __fixtures__/playlist.flat.json) — this is a defensive
    // encoding of yt-dlp's documented placeholder-title convention; a real
    // capture with such an entry was not available during slice 1 (see
    // docs/03-data-sources.md).
    const unavailable = result.members.filter((m) => m.availability === "unavailable");
    expect(unavailable.map((m) => m.position)).toEqual([6, 7]);
    expect(unavailable.map((m) => m.title)).toEqual(["[Private video]", "[Deleted video]"]);
  });

  // Threat matrix (c): an oversized listing must parse without ENOBUFS —
  // proves listMembers sets an explicit maxBuffer rather than relying on
  // execFile's 1 MiB default.
  it("parses an oversized listing (>=250 entries, >1 MiB) without ENOBUFS", async () => {
    process.env["VETA_FAKE_PLAYLIST_FIXTURE"] = OVERSIZED_FIXTURE;
    const source = new YtDlpPlaylistSource();
    const identity = (await source.identifyPlaylist(
      "https://www.youtube.com/playlist?list=PLoversizedsynthetic00000000000",
    ))!;

    const result = await source.listMembers(identity);

    expect(result.members.length).toBe(260);
    expect(result.members[259]!.position).toBe(260);
  });
});
