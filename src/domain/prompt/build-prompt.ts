import { formatClock } from "../time/clock.ts";
import type { VideoMetadata } from "../video/metadata.ts";

/**
 * Render the instructions handed to an AI assistant alongside the transcript.
 *
 * The prompt is the product's second half: the transcript captures what was
 * said, and this document tells an assistant sitting in the same folder how to
 * turn it into study notes worth keeping. It is addressed to the assistant
 * directly — the person only delivers it.
 *
 * Pure by construction, like the transcript renderer: metadata in, one
 * markdown string out, no clock, no filesystem.
 *
 * @param transcriptLang base language of the downloaded caption track, or
 *   `null` when the source never said — the notes language rule degrades to
 *   "match the transcript" rather than guessing.
 */
export function buildNotesPrompt(
  metadata: VideoMetadata,
  transcriptLang: string | null,
): string {
  const blocks: string[] = [
    "# Build study notes from this video's transcript",
    "",
    "You are working inside a video's package folder. It contains `transcript.md`, " +
      "a timestamped transcript of the video. Your mission is to turn that " +
      "transcript into structured study notes that stand on their own.",
    "",
    ...contextBlock(metadata),
    "## How the transcript is written",
    "",
    "Every paragraph in `transcript.md` begins with a timestamp deep link, such as " +
      "[`3:25`](https://example.com/watch?v=...&t=205), pointing at the exact moment in the " +
      "video where that paragraph starts. These links are your citation currency: " +
      "copy them verbatim whenever you reference a passage.",
    "",
    "## Step 1 — Read and classify",
    "",
    "Read `transcript.md` in full before writing anything. Then classify the " +
      "content: educational video, tutorial, podcast/interview, conference talk, " +
      "opinion/news, or other. Let that classification drive the rest — it decides " +
      "how the material splits into topics and how deep each note goes. A tutorial " +
      "wants precise, reproducible steps; an interview wants positions, arguments, " +
      "and disagreements; a conference talk wants the core ideas and their " +
      "supporting evidence.",
    "",
    "## Step 2 — Write the notes",
    "",
    "Create a `notes/` folder next to `transcript.md` containing:",
    "",
    "- `notes/README.md` — the root file. It holds the video title, a short " +
      "summary, and the complete topic breakdown as an ordered list where each " +
      "entry links to its topic file. Add a mermaid overview diagram when it " +
      "genuinely clarifies the video's structure; skip it otherwise.",
    "- One file per topic, named `notes/NN-topic-slug.md` with a zero-padded " +
      "order prefix (`notes/01-introduction.md`, `notes/02-architecture.md`, ...).",
    "",
    "### Rules for every topic file",
    "",
    "- Be concise: capture the main points of each section, never re-transcribe it.",
    "- Prefer enumerations and bullet points over prose.",
    "- Every key claim, definition, or data point ends with its timestamp deep " +
      "link copied from `transcript.md`, cited like references in a paper, so the " +
      "reader can jump to the exact moment it was said.",
    "- Include a mermaid diagram only when it genuinely helps — flows, " +
      "architectures, comparisons, timelines. Never decoratively.",
    "",
    "## Language",
    "",
    languageRule(transcriptLang),
    "",
    "## What the notes are for",
    "",
    "Someone should be able to review this video later without rewatching it, and " +
      "jump back to any cited moment through its timestamp link. Every note you " +
      "write serves that goal.",
  ];

  return `${blocks.join("\n")}\n`;
}

/** The facts the assistant gets about the video, omitting whatever is unknown. */
function contextBlock(metadata: VideoMetadata): string[] {
  const facts: string[] = [`- Title: ${metadata.title}`];
  if (metadata.canonicalUrl !== null) facts.push(`- URL: ${metadata.canonicalUrl}`);
  facts.push(`- Duration: ${formatClock(metadata.durationSec)}`);
  if (metadata.uploader !== null) facts.push(`- Uploader: ${metadata.uploader}`);

  const blocks: string[] = ["## The video", "", ...facts, ""];

  if (metadata.chapters.length > 0) {
    blocks.push("### Chapters", "");
    for (const chapter of metadata.chapters) {
      blocks.push(`- \`${formatClock(chapter.startSec)}\` ${chapter.title}`);
    }
    blocks.push("");
  }

  return blocks;
}

function languageRule(transcriptLang: string | null): string {
  const language =
    transcriptLang === null
      ? "the same language the transcript is written in"
      : `"${transcriptLang}"`;
  return (
    `Write all notes in ${language}. The transcript's language is the reader's ` +
    "language; do not translate."
  );
}
