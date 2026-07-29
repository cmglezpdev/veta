import { formatClock } from "../time/clock.ts";
import type { VideoMetadata } from "../video/metadata.ts";
import { deepLink } from "./deep-link.ts";
import type { Paragraph } from "./segment.ts";

/**
 * The last stage: paragraphs in, one markdown document out.
 *
 * Markdown is the target because the document has two readers with the same
 * needs. A person wants headings to skim and timestamps to jump from; a
 * language model reads headings as structure and spends no tokens on markup
 * it would have to strip. Anything richer would serve one at the other's
 * expense.
 *
 * Pure by construction: it writes nothing, reads no clock, and takes the URL
 * it links against as an input.
 */
export function renderTranscript(
  metadata: VideoMetadata,
  paragraphs: readonly Paragraph[],
): string {
  const blocks: string[] = [`# ${metadata.title}`];

  const summary = describe(metadata);
  if (summary !== null) blocks.push(summary);

  // Headings are driven by the paragraphs, not by the chapter list: a chapter
  // with no speech in it produces no heading, rather than an empty section.
  let openChapter: number | null | undefined;

  for (const paragraph of paragraphs) {
    if (paragraph.chapterIndex !== openChapter) {
      openChapter = paragraph.chapterIndex;
      const chapter = openChapter === null ? undefined : metadata.chapters[openChapter];
      if (chapter !== undefined) {
        blocks.push(`## ${openChapter! + 1}. ${chapter.title}`);
      }
    }

    blocks.push(`${marker(metadata, paragraph.startMs)} ${paragraph.text}`);
  }

  return `${blocks.join("\n\n")}\n`;
}

/** A one-line credit for the video, omitting whatever the source did not give us. */
function describe(metadata: VideoMetadata): string | null {
  const parts: string[] = [];
  if (metadata.uploader !== null) parts.push(metadata.uploader);
  if (metadata.durationSec > 0) parts.push(formatClock(metadata.durationSec));
  if (metadata.canonicalUrl !== null) parts.push(metadata.canonicalUrl);

  return parts.length === 0 ? null : `*${parts.join(" · ")}*`;
}

/**
 * The timestamp that opens each paragraph — a link when we know the video's
 * URL, plain text when we do not. Degrading to text keeps the document
 * readable instead of emitting a link to nowhere.
 */
function marker(metadata: VideoMetadata, atMs: number): string {
  const clock = formatClock(atMs / 1000);
  return metadata.canonicalUrl === null
    ? `\`${clock}\``
    : `[\`${clock}\`](${deepLink(metadata.canonicalUrl, atMs)})`;
}
