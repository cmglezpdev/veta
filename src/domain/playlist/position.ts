/**
 * The `NN-` prefix a member's notes subfolder carries.
 *
 * Positions are the curation vocabulary (D5, D9): they always refer to a
 * member's ORIGINAL place in the playlist, never its place in a curated
 * subset. That is what lets a curated run skip member 3 of 12 and still
 * write member 4 as `04-…`, not `03-…` — the reader's index into the full
 * playlist stays meaningful even when some folders are missing.
 */

/** How many digits the largest position in a playlist of this size needs. */
export function positionWidth(totalCount: number): number {
  return Math.max(2, String(totalCount).length);
}

/** Zero-pad a 1-based position to `width` digits. Never truncates. */
export function formatPosition(position: number, width: number): string {
  return String(position).padStart(width, "0");
}

/** The full `NN-<video-slug>` subfolder name a member's notes live under. */
export function memberFolderName(position: number, width: number, videoSlug: string): string {
  return `${formatPosition(position, width)}-${videoSlug}`;
}
