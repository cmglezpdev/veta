/**
 * Runs the whole chain against the committed fixtures and writes the markdown
 * document it produces. No network, no yt-dlp — everything reads from disk.
 *
 * Usage: node scripts/build-transcript.ts [outputPath]
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { parseInfoJson } from "../src/adapters/ytdlp/info-json.ts";
import { parseJson3 } from "../src/adapters/ytdlp/json3.ts";
import { assignChapters } from "../src/domain/transcript/chapters.ts";
import { renderTranscript } from "../src/domain/transcript/render.ts";
import { segmentParagraphs } from "../src/domain/transcript/segment.ts";

const fixtures = fileURLToPath(new URL("../src/adapters/ytdlp/__fixtures__/", import.meta.url));
const captions = fixtures + "captions.full.en.json3";
const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

const output = process.argv[2] ?? fileURLToPath(new URL("../out/transcript.md", import.meta.url));

const metadata = parseInfoJson(readJson(fixtures + "info.json"));
const { cues } = parseJson3(readJson(captions));
const paragraphs = segmentParagraphs(assignChapters(cues, metadata.chapters));
const markdown = renderTranscript(metadata, paragraphs);

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, markdown, "utf8");

const kb = (bytes: number): string => `${Math.round(bytes / 1024).toLocaleString()} KB`;
const sourceBytes = statSync(captions).size;

console.log(`wrote ${output}`);
console.log(`  paragraphs  ${paragraphs.length}`);
console.log(`  chapters    ${metadata.chapters.length}`);
console.log(`  ${kb(sourceBytes)} of json3 -> ${kb(Buffer.byteLength(markdown))} of markdown`);
console.log(`  ${(sourceBytes / Buffer.byteLength(markdown)).toFixed(1)}x smaller`);
