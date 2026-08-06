import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FsStore } from "../adapters/store/fs-store.ts";
import { resetBinaryCache } from "../adapters/ytdlp/binary.ts";
import { YtDlpExtractionSource } from "../adapters/ytdlp/ytdlp-extraction-source.ts";
import { isVetaError } from "../domain/errors/veta-error.ts";
import { extract } from "./extract.ts";

const FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../adapters/ytdlp/__fixtures__",
);
const INFO_FIXTURE = path.join(FIXTURES, "info.json");
const CAPTION_FIXTURE = path.join(FIXTURES, "captions.en.json3");

let root: string;
let dataDir: string;
let binary: string;
let previousBinaryPath: string | undefined;
let previousPath: string | undefined;

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "veta-extract-"));
  dataDir = path.join(root, "out");
  binary = path.join(root, "yt-dlp");
  previousBinaryPath = process.env["VETA_YTDLP_PATH"];
  previousPath = process.env["PATH"];

  const body = `#!/bin/sh
set -eu
output=''
language='en'
write_info=0
write_captions=0
for arg in "$@"; do printf '%s\\n' "$arg" >> ${shellQuote(path.join(root, "args.log"))}; done
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

function newStore(): FsStore {
  return new FsStore({ dataDir });
}

describe("extract", () => {
  it("writes a markdown transcript under a slugged package directory", async () => {
    const source = new YtDlpExtractionSource();
    const transcriptPath = await extract("1VqKUrxR2C8", source, newStore());

    expect(transcriptPath).toBe(
      path.join(dataDir, "building-opencode-with-dax-raad", "transcript.md"),
    );

    const markdown = await readFile(transcriptPath, "utf8");
    expect(markdown.length).toBeGreaterThan(0);
    expect(markdown.startsWith("# Building OpenCode with Dax Raad")).toBe(true);
    expect(markdown).toContain("## 1. Intro");
  });

  it("accepts a full YouTube URL", async () => {
    const source = new YtDlpExtractionSource();
    const transcriptPath = await extract(
      "https://www.youtube.com/watch?v=1VqKUrxR2C8",
      source,
      newStore(),
    );

    expect(transcriptPath.endsWith("transcript.md")).toBe(true);
    const markdown = await readFile(transcriptPath, "utf8");
    expect(markdown.startsWith("# ")).toBe(true);
  });

  it("keeps the package flat under the data directory", async () => {
    const source = new YtDlpExtractionSource();

    await extract("1VqKUrxR2C8", source, newStore());

    // Directories only: `index.json` is the catalog, and it belongs at the data
    // root. What this guards is that no `videos/` level appeared to hold the
    // package.
    const entries = await readdir(dataDir, { withFileTypes: true });
    const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

    expect(directories).toEqual(["building-opencode-with-dax-raad"]);
  });

  it("persists run state, because the runner behind it now records every step", async () => {
    const source = new YtDlpExtractionSource();

    await extract("1VqKUrxR2C8", source, newStore());

    expect(await readdir(dataDir)).toContain("index.json");
    expect(await readdir(path.join(dataDir, "building-opencode-with-dax-raad"))).toContain(
      "state.json",
    );
  });

  it("leaves no interim id-named directory behind after the rename", async () => {
    const source = new YtDlpExtractionSource();

    await extract("1VqKUrxR2C8", source, newStore());

    expect(await readdir(dataDir)).not.toContain("1vqkurxr2c8");
  });

  it("re-extracts the same video into its existing package instead of refusing", async () => {
    // The 5c gap, closed: state.json carries the identity, so the runner can
    // tell "this video again" from "another video that slugs the same".
    const source = new YtDlpExtractionSource();
    const first = await extract("1VqKUrxR2C8", source, newStore());

    const second = await extract("1VqKUrxR2C8", source, newStore());

    expect(second).toBe(first);
  });

  it("still refuses when a different video resolves to the same package name", async () => {
    // The fixture answers every id with the same title, which is exactly the
    // collision: no run record matches this id, so the name is genuinely taken.
    const source = new YtDlpExtractionSource();
    await extract("1VqKUrxR2C8", source, newStore());

    let code = "no-throw";
    try {
      await extract("2VqKUrxR2C8", source, newStore());
    } catch (error) {
      code = isVetaError(error) ? error.code : `not-a-veta-error: ${String(error)}`;
    }

    expect(code).toBe("WORK_DIR_EXISTS");
  });

  it("passes force through to the runner", async () => {
    // Without force a finished run answers from disk and raw/ is untouched;
    // force resets the package, so a marker planted in raw/ must disappear.
    const source = new YtDlpExtractionSource();
    await extract("1VqKUrxR2C8", source, newStore());

    const marker = path.join(dataDir, "building-opencode-with-dax-raad", "raw", "marker.txt");
    await writeFile(marker, "stale", "utf8");

    await extract("1VqKUrxR2C8", source, newStore());
    expect(await readFile(marker, "utf8")).toBe("stale");

    await extract("1VqKUrxR2C8", source, newStore(), { force: true });
    await expect(readFile(marker, "utf8")).rejects.toThrow();
  });
});
