/**
 * Runs the parsing chain against the committed fixtures and reports what it
 * found. No network, no yt-dlp — everything here reads from disk.
 *
 * Usage: node scripts/inspect-transcript.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parseInfoJson } from "../src/adapters/ytdlp/info-json.ts";
import { parseJson3 } from "../src/adapters/ytdlp/json3.ts";
import { assignChapters } from "../src/domain/transcript/chapters.ts";
import { isMonotonic } from "../src/domain/transcript/cue.ts";
import { formatClock } from "../src/domain/time/clock.ts";
import {
  PARAGRAPH_MAX_WORDS,
  SENTENCE_END,
  type BreakReason,
  segmentParagraphs,
} from "../src/domain/transcript/segment.ts";

const fixtures = fileURLToPath(new URL("../src/adapters/ytdlp/__fixtures__/", import.meta.url));
const readJson = (name: string): unknown => JSON.parse(readFileSync(fixtures + name, "utf8"));

const metadata = parseInfoJson(readJson("info.json"));
const { cues, clampCount } = parseJson3(readJson("captions.full.en.json3"));

console.log("metadata");
console.log(`  title      ${metadata.title}`);
console.log(`  duration   ${metadata.durationSec}s`);
console.log(`  uploader   ${metadata.uploader ?? "-"}`);
console.log(`  chapters   ${metadata.chapters.length}`);

metadata.chapters.forEach((chapter, i) => {
  const span = `${formatClock(chapter.startSec)}-${formatClock(chapter.endSec)}`;
  console.log(`    ${String(i).padStart(2)}  ${span.padEnd(13)} ${chapter.title}`);
});

console.log("\ncues");
console.log(`  parsed     ${cues.length.toLocaleString()}`);
console.log(`  words      ${cues.reduce((n, c) => n + c.text.split(" ").length, 0).toLocaleString()}`);
console.log(`  clamped    ${clampCount}   <- must be 0`);
console.log(`  monotonic  ${isMonotonic(cues)}   <- must be true`);

const gaps = cues.slice(0, -1).map((cue, i) => cues[i + 1]!.startMs - cue.endMs);
const sorted = [...gaps].sort((a, b) => a - b);
const at = (q: number): number => sorted[Math.floor((sorted.length - 1) * q)]!;

console.log("\ninter-cue gaps (ms)");
console.log(`  negative   ${gaps.filter((g) => g < 0).length}   <- must be 0`);
console.log(`  min ${at(0)} | median ${at(0.5)} | p90 ${at(0.9)} | p99 ${at(0.99)} | max ${at(1)}`);
for (const threshold of [700, 1000, 1500, 2000]) {
  console.log(`  >= ${String(threshold).padStart(4)}ms  ${gaps.filter((g) => g >= threshold).length}`);
}

const chaptered = assignChapters(cues, metadata.chapters);
const paragraphs = segmentParagraphs(chaptered);

const unassigned = chaptered.filter((c) => c.chapterIndex === null).length;
console.log("\nchapter assignment");
console.log(`  before first chapter  ${unassigned}`);
console.log(`  distinct chapters hit ${new Set(chaptered.map((c) => c.chapterIndex)).size}`);

const lengths = paragraphs.map((p) => p.text.split(/\s+/).length).sort((a, b) => a - b);
const pick = (q: number): number => lengths[Math.floor((lengths.length - 1) * q)]!;

console.log("\nparagraphs");
console.log(`  count      ${paragraphs.length}`);
console.log(`  words: min ${pick(0)} | median ${pick(0.5)} | p90 ${pick(0.9)} | max ${pick(1)}`);

const reasons = paragraphs.map((p) => p.endedBy).filter((r): r is BreakReason => r !== null);
const tally = new Map<BreakReason, number>();
for (const reason of reasons) tally.set(reason, (tally.get(reason) ?? 0) + 1);

console.log("\nwhy each paragraph ended");
for (const [reason, n] of [...tally].sort((a, b) => b[1] - a[1])) {
  const bar = "#".repeat(Math.round((n / reasons.length) * 40));
  console.log(`  ${reason.padEnd(13)} ${String(n).padStart(4)}  ${((n / reasons.length) * 100).toFixed(1).padStart(5)}%  ${bar}`);
}

// The bounds the design commits to. These are what a human eyeballing the
// rendered markdown cannot check.
const capShare = (tally.get("cap") ?? 0) / reasons.length;
const midSentence = paragraphs.filter(
  (p) => p.endedBy !== null && p.endedBy !== "chapter" && !SENTENCE_END.test(p.text.trim()),
).length;
const straddling = paragraphs.filter((p, i) => {
  // Half-open range: the next paragraph's first cue is NOT part of this one.
  const upper = paragraphs[i + 1]?.startMs ?? Infinity;
  const cuesIn = chaptered.filter((c) => c.startMs >= p.startMs && c.startMs < upper);
  return new Set(cuesIn.map((c) => c.chapterIndex)).size > 1;
}).length;

const check = (ok: boolean, label: string, detail: string): void =>
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(34)} ${detail}`);

console.log("\ncalibration bounds");
check(capShare < 0.15, "cap breaks < 15% of all", `${(capShare * 100).toFixed(1)}%`);
check(pick(0.5) >= 60 && pick(0.5) <= 160, "median length within 60-160 words", `${pick(0.5)}`);
check(pick(1) <= PARAGRAPH_MAX_WORDS + 40, "max length bounded", `${pick(1)}`);
check(straddling === 0, "paragraphs spanning two chapters", `${straddling}`);
check(
  midSentence / paragraphs.length < 0.15,
  "non-chapter mid-sentence < 15%",
  `${((midSentence / paragraphs.length) * 100).toFixed(1)}%`,
);
