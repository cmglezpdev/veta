import { formatClock } from "../time/clock.ts";
import type { VideoMetadata } from "../video/metadata.ts";

/** Where the prompt should point: the one package this prompt is about. */
export type PromptTarget = {
  /** Absolute path to the rendered transcript inside the data directory. */
  readonly transcriptPath: string;
  /**
   * The package's directory name. The assistant reuses it as the name of the
   * notes folder, so notes and package identify the same video by the same name.
   */
  readonly packageName: string;
  /**
   * Absolute path to the downloaded cover image inside the data directory, or
   * `null` when the package has none — the prompt then says nothing about a
   * cover at all.
   */
  readonly thumbnailPath: string | null;
};

/**
 * Render the instructions handed to an AI assistant alongside the transcript.
 *
 * The prompt is the product's second half: the transcript captures what was
 * said, and this document tells an assistant how to turn it into study notes
 * worth keeping. It is addressed to the assistant directly — the person only
 * delivers it.
 *
 * The assistant runs wherever the person opened it — an Obsidian vault, a
 * project folder — while the transcript stays inside veta's data directory.
 * The prompt bridges the two: it points at the transcript by absolute path
 * and has the notes created in the assistant's own working directory.
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
  target: PromptTarget,
): string {
  const notesDir = target.packageName;
  // The cover keeps whatever extension the source gave it, so the file name
  // is read off the path rather than assumed.
  const coverName = target.thumbnailPath?.replace(/^.*[/\\]/, "") ?? null;
  const blocks: string[] = [
    "# Build study notes from this video's transcript",
    "",
    "A timestamped transcript of a video lives at:",
    "",
    `\`${target.transcriptPath}\``,
    "",
    "Your mission is to turn that transcript into structured study notes that " +
      "stand on their own, written into a new folder inside your current " +
      "working directory.",
    "",
    ...contextBlock(metadata),
    "## How the transcript is written",
    "",
    "Every paragraph in the transcript begins with a timestamp deep link, such as " +
      "[`3:25`](https://example.com/watch?v=...&t=205), pointing at the exact moment in the " +
      "video where that paragraph starts. These links are your citation currency: " +
      "copy them verbatim whenever you reference a passage.",
    "",
    "## Step 1 — Read and classify",
    "",
    "Read the transcript in full before writing anything; if it is long, read " +
      "it in chunks until you have covered all of it. Then classify the " +
      "content: educational video, tutorial, podcast/interview, conference talk, " +
      "opinion/news, or other. Let that classification drive the rest — it decides " +
      "how the material splits into topics and how deep each note goes. A tutorial " +
      "wants precise, reproducible steps; an interview wants positions, arguments, " +
      "and disagreements; a conference talk wants the core ideas and their " +
      "supporting evidence.",
    "",
    "## Step 2 — Write the notes",
    "",
    `Create a \`${notesDir}/\` folder in your current working directory containing:`,
    "",
    `- \`${notesDir}/README.md\` — the root file, in this order: the video title, a ` +
      "short summary of what the video covers, the complete topic breakdown as " +
      "an ordered list where each entry links to its topic file, and a closing " +
      "`## Key takeaways` section (below). Add a mermaid overview diagram when " +
      "it genuinely clarifies the video's structure; skip it otherwise." +
      (coverName === null
        ? ""
        : " Embed the cover image at the top of the README, right under the title."),
    "- One file per topic, named with a zero-padded " +
      `order prefix (\`${notesDir}/01-introduction.md\`, \`${notesDir}/02-architecture.md\`, ...).`,
    `- \`${notesDir}/transcript.md\` — a verbatim copy of the transcript file ` +
      "named above. Copy it as-is, without editing, so the notes folder stands " +
      "alone for future questions about the video.",
    ...(coverName === null
      ? []
      : [
          `- \`${notesDir}/${coverName}\` — a copy of the video's cover image at ` +
            `\`${target.thumbnailPath}\`. Copy it as-is, without editing, so the ` +
            "README's embed works wherever the notes folder ends up.",
        ]),
    "",
    "### The `## Key takeaways` section",
    "",
    "The summary says what the video is about; the takeaways say what it " +
      "established. Close the README with the conclusions a viewer should walk " +
      "away with — results, measurements, comparisons, decisions — each as a " +
      'bullet with its timestamp deep link. "They benchmarked the model" is ' +
      'summary; "it beat model X by 80% on 3D generation but stalled on games" ' +
      "is a takeaway. When the video genuinely establishes nothing — pure " +
      "opinion, no claims — skip the section rather than padding it.",
    "",
    "### Rules for every topic file",
    "",
    "- Be concise: capture the main points of each section, never re-transcribe it.",
    "- Capture what each section teaches, not just what happens in it: when " +
      "something is built, benchmarked, or demonstrated, record what was done " +
      "and what came of it — names and numbers, never \"they tested it and it " +
      "went well\".",
    "- Prefer enumerations and bullet points over prose.",
    "- Every key claim, definition, or data point ends with its timestamp deep " +
      "link copied from the transcript, cited like references in a paper, so the " +
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
