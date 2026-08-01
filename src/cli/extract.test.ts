import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetBinaryCache } from "../adapters/ytdlp/binary.ts";
import { YtDlpExtractionSource } from "../adapters/ytdlp/ytdlp-extraction-source.ts";
import { extract } from "./extract.ts";

const FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../adapters/ytdlp/__fixtures__",
);
const INFO_FIXTURE = path.join(FIXTURES, "info.json");
const CAPTION_FIXTURE = path.join(FIXTURES, "captions.en.json3");

let root: string;
let outputRoot: string;
let binary: string;
let previousBinaryPath: string | undefined;
let previousPath: string | undefined;

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "veta-extract-"));
  outputRoot = path.join(root, "out");
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

describe("extract", () => {
  it("writes a markdown transcript under a slugged package directory", async () => {
    const source = new YtDlpExtractionSource();
    const transcriptPath = await extract("1VqKUrxR2C8", source, { outputRoot });

    expect(transcriptPath).toBe(
      path.join(outputRoot, "building-opencode-with-dax-raad", "transcript.md"),
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
      { outputRoot },
    );

    expect(transcriptPath.endsWith("transcript.md")).toBe(true);
    const markdown = await readFile(transcriptPath, "utf8");
    expect(markdown.startsWith("# ")).toBe(true);
  });
});
