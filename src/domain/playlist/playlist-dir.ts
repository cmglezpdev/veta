/**
 * Two names for one playlist (D7).
 *
 * The store's on-disk `dirName` must never collide with a video slug or
 * another playlist sharing the same title, so it carries the playlist id.
 * The user-facing notes folder has no such collision risk — the assistant
 * only ever creates one of them per run — so it stays plain and readable.
 */
import { slugify } from "../video/slug.ts";

/**
 * The store's flat top-level package name for a playlist.
 *
 * `pl-` distinguishes it from a video package sharing the same slug; the
 * lowercased id makes the name durable even if the playlist is renamed.
 */
export function playlistDirName(title: string, playlistId: string): string {
  return `pl-${slugify(title, playlistId)}-${playlistId.toLowerCase()}`;
}

/**
 * The library root the playlist prompt tells the assistant to create.
 *
 * Deliberately just the slug: this name is read by a human, not indexed by
 * the store, so it does not need the id's disambiguation.
 */
export function playlistNotesDir(title: string, playlistId: string): string {
  return slugify(title, playlistId);
}
