import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetBinaryCache } from "../adapters/ytdlp/binary.ts";
import { dataDirFromEnv, run } from "./run.ts";

const FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../adapters/ytdlp/__fixtures__",
);
const INFO_FIXTURE = path.join(FIXTURES, "info.json");
const CAPTION_FIXTURE = path.join(FIXTURES, "captions.en.json3");
const PLAYLIST_URL = "https://www.youtube.com/playlist?list=PLtestplaylist03";

let root: string;
let outputRoot: string;
let binary: string;
let previousBinaryPath: string | undefined;
let previousPath: string | undefined;
let previousDataDir: string | undefined;
let previousPlaylistFixture: string | undefined;

function playlistMember(id: string, title: string): {
  readonly _type: "url";
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly duration: number;
} {
  return { _type: "url", id, title, url: `https://www.youtube.com/watch?v=${id}`, duration: 100 };
}

async function writePlaylistFixture(title: string, members: readonly unknown[]): Promise<void> {
  const fixturePath = path.join(root, "playlist-fixture.json");
  await writeFile(fixturePath, JSON.stringify({ title, entries: members }), "utf8");
  process.env["VETA_FAKE_PLAYLIST_FIXTURE"] = fixturePath;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function argv(...args: readonly string[]): readonly string[] {
  return ["node", "veta", ...args];
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "veta-run-"));
  outputRoot = path.join(root, "out");
  binary = path.join(root, "yt-dlp");
  previousBinaryPath = process.env["VETA_YTDLP_PATH"];
  previousPath = process.env["PATH"];
  previousDataDir = process.env["VETA_DATA_DIR"];
  previousPlaylistFixture = process.env["VETA_FAKE_PLAYLIST_FIXTURE"];

  const body = `#!/bin/sh
set -eu
output=''
language='en'
write_info=0
write_captions=0
flat=0
dump_json=0
for arg in "$@"; do printf '%s\\n' "$arg" >> ${shellQuote(path.join(root, "args.log"))}; done
while [ "$#" -gt 0 ]; do
  case "$1" in
    --version) printf '%s\\n' '2026.07.31'; exit 0 ;;
    --flat-playlist) flat=1 ;;
    -J) dump_json=1 ;;
    --write-info-json) write_info=1 ;;
    --write-subs|--write-auto-subs) write_captions=1 ;;
    --sub-langs) shift; language="$1" ;;
    -o) shift; output="$1" ;;
  esac
  shift
done
if [ "$flat" -eq 1 ] && [ "$dump_json" -eq 1 ]; then
  cat "\${VETA_FAKE_PLAYLIST_FIXTURE:?}"
  exit 0
fi
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
  process.env["VETA_DATA_DIR"] = outputRoot;
  resetBinaryCache();
});

afterEach(async () => {
  if (previousBinaryPath === undefined) delete process.env["VETA_YTDLP_PATH"];
  else process.env["VETA_YTDLP_PATH"] = previousBinaryPath;
  if (previousPath === undefined) delete process.env["PATH"];
  else process.env["PATH"] = previousPath;
  if (previousDataDir === undefined) delete process.env["VETA_DATA_DIR"];
  else process.env["VETA_DATA_DIR"] = previousDataDir;
  if (previousPlaylistFixture === undefined) delete process.env["VETA_FAKE_PLAYLIST_FIXTURE"];
  else process.env["VETA_FAKE_PLAYLIST_FIXTURE"] = previousPlaylistFixture;
  resetBinaryCache();
  await rm(root, { force: true, recursive: true });
});

describe("dataDirFromEnv()", () => {
  it("defaults to ~/.veta when VETA_DATA_DIR is unset", () => {
    // Packages are app state, not deliverables: they belong in a global home
    // directory, never in whatever folder the command happens to run from.
    delete process.env["VETA_DATA_DIR"];
    expect(dataDirFromEnv()).toBe(path.join(homedir(), ".veta"));
  });

  it("honors VETA_DATA_DIR as an override", () => {
    expect(dataDirFromEnv()).toBe(outputRoot);
  });
});

describe("run()", () => {
  it("returns 0 for --help", async () => {
    await expect(run(argv("--help"))).resolves.toBe(0);
  });

  it("returns 0 for extract --help", async () => {
    await expect(run(argv("extract", "--help"))).resolves.toBe(0);
  });

  it("extracts via default positional url", async () => {
    const code = await run(argv("1VqKUrxR2C8"));
    expect(code).toBe(0);

    const transcriptPath = path.join(
      outputRoot,
      "building-opencode-with-dax-raad",
      "transcript.md",
    );
    const markdown = await readFile(transcriptPath, "utf8");
    expect(markdown.startsWith("# Building OpenCode with Dax Raad")).toBe(true);
  });

  it("extracts via extract subcommand", async () => {
    const code = await run(argv("extract", "1VqKUrxR2C8"));
    expect(code).toBe(0);

    const transcriptPath = path.join(
      outputRoot,
      "building-opencode-with-dax-raad",
      "transcript.md",
    );
    expect(await readFile(transcriptPath, "utf8")).toContain("## 1. Intro");
  });

  it("returns 0 for doctor when yt-dlp is available", async () => {
    await expect(run(argv("doctor"))).resolves.toBe(0);
  });

  it("returns 0 for list on an empty data directory", async () => {
    await expect(run(argv("list"))).resolves.toBe(0);
  });

  it("routes a playlist URL to the playlist path", async () => {
    await writePlaylistFixture("Test Playlist", [playlistMember("1VqKUrxR2C8", "Playlist Member")]);

    const code = await run(argv(PLAYLIST_URL));
    expect(code).toBe(0);

    const entries = await readdir(outputRoot, { withFileTypes: true });
    const playlistDir = entries.find((entry) => entry.isDirectory() && entry.name.startsWith("pl-"));
    expect(playlistDir).toBeDefined();
    await expect(
      readFile(path.join(outputRoot, playlistDir!.name, "prompt.md"), "utf8"),
    ).resolves.toContain("Test Playlist");
  });

  it("keeps a watch URL with a list param on the single-video path", async () => {
    const code = await run(
      argv("https://www.youtube.com/watch?v=1VqKUrxR2C8&list=PLtestplaylist03"),
    );
    expect(code).toBe(0);

    const transcriptPath = path.join(
      outputRoot,
      "building-opencode-with-dax-raad",
      "transcript.md",
    );
    await expect(readFile(transcriptPath, "utf8")).resolves.toContain("# Building OpenCode with Dax Raad");

    const entries = await readdir(outputRoot, { withFileTypes: true });
    expect(entries.some((entry) => entry.isDirectory() && entry.name.startsWith("pl-"))).toBe(false);
  });
});
