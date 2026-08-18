import { VetaError } from "../../domain/errors/veta-error.ts";
import type {
  PlaylistIdentity,
  PlaylistMember,
  PlaylistSourcePort,
} from "../../ports/playlist-source.ts";
import { resolveYtDlpBinary } from "./binary.ts";
import { invokeYtDlp } from "./invoke.ts";

const SOURCE_ID = "yt-dlp";

/**
 * Real YouTube playlist ids always start with a letter or digit. Requiring
 * that also rejects an argument-injection attempt shaped like a CLI flag
 * (`--exec`) and anything containing `/`, `.`, `;`, or whitespace — the
 * same alphabet `isValidDirName` uses for the same reason.
 */
const PLAYLIST_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/** Two ids that resolve to a playlist page but are not playlists veta supports. */
const REJECTED_LIST_IDS = new Set(["WL", "LL"]);
/** YouTube "mix" (auto-generated radio) ids always start with this prefix. */
const MIX_PREFIX = "RD";

/** execFile's 1 MiB default overflows well before a large playlist listing does. */
const LISTING_MAX_BUFFER = 64 * 1024 * 1024;

/** yt-dlp's literal placeholder titles for a member it could not resolve. */
const UNAVAILABLE_TITLE = /^\[(private|deleted) video\]$/i;

function canonicalPlaylistUrl(playlistId: string): string {
  return `https://www.youtube.com/playlist?list=${playlistId}`;
}

type RawEntry = {
  readonly id?: unknown;
  readonly title?: unknown;
  readonly url?: unknown;
  readonly duration?: unknown;
  readonly ie_key?: unknown;
};

/**
 * Whether an entry needs manual verification against a real private/deleted
 * member (task 1.5 in the tasks artifact could not confirm this against a
 * real capture — see docs/03-data-sources.md). This defensively combines
 * every signal the design and smoke test named: a placeholder title, a
 * missing id, a missing duration, or an extractor other than YouTube's.
 */
function isUnavailableEntry(entry: RawEntry): boolean {
  if (typeof entry.id !== "string" || entry.id.length === 0) return true;
  if (typeof entry.title !== "string" || entry.title.length === 0) return true;
  if (UNAVAILABLE_TITLE.test(entry.title)) return true;
  if (entry.duration === null || entry.duration === undefined) return true;
  if (typeof entry.ie_key === "string" && entry.ie_key !== "Youtube") return true;
  return false;
}

function playlistTitle(
  root: { readonly title?: unknown; readonly playlist?: unknown },
  fallbackId: string,
): string {
  if (typeof root.title === "string" && root.title.length > 0) return root.title;
  if (typeof root.playlist === "string" && root.playlist.length > 0) return root.playlist;
  return fallbackId;
}

/**
 * Lists playlist membership through yt-dlp's `--flat-playlist -J` mode: one
 * process, one JSON root, `entries[]` in arrival order (binding override,
 * per smoke test #3645 — design D4's `--dump-json` NDJSON assumption did
 * not survive contact with the real payload).
 */
export class YtDlpPlaylistSource implements PlaylistSourcePort {
  readonly sourceId = SOURCE_ID;

  async identifyPlaylist(input: string): Promise<PlaylistIdentity | null> {
    let url: URL;
    try {
      url = new URL(input.trim());
    } catch {
      return null;
    }

    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if (hostname !== "youtube.com" && hostname !== "m.youtube.com") return null;
    if (url.pathname !== "/playlist") return null;

    const listId = url.searchParams.get("list");
    if (listId === null) return null;

    if (REJECTED_LIST_IDS.has(listId) || listId.startsWith(MIX_PREFIX)) {
      throw new VetaError(
        "INPUT_UNRECOGNIZED",
        "Mixes, Watch Later, and Liked Videos are not supported playlists.",
      );
    }
    if (!PLAYLIST_ID.test(listId)) {
      throw new VetaError(
        "INPUT_UNRECOGNIZED",
        "The playlist id contains characters that are not allowed.",
      );
    }

    return {
      sourceId: SOURCE_ID,
      playlistId: listId,
      canonicalUrl: canonicalPlaylistUrl(listId),
    };
  }

  async listMembers(
    identity: PlaylistIdentity,
  ): Promise<{ title: string; members: readonly PlaylistMember[] }> {
    const binary = await resolveYtDlpBinary();

    const result = await invokeYtDlp(
      binary.path,
      ["--flat-playlist", "-J", "--no-warnings", "--socket-timeout", "30", identity.canonicalUrl],
      { maxBuffer: LISTING_MAX_BUFFER },
    );

    const root = JSON.parse(result.stdout) as {
      readonly title?: unknown;
      readonly playlist?: unknown;
      readonly entries?: unknown;
    };
    const rawEntries = Array.isArray(root.entries) ? (root.entries as RawEntry[]) : [];

    const members: PlaylistMember[] = rawEntries.map((entry, index) => ({
      position: index + 1,
      externalId: typeof entry.id === "string" && entry.id.length > 0 ? entry.id : null,
      title: typeof entry.title === "string" && entry.title.length > 0 ? entry.title : null,
      canonicalUrl: typeof entry.url === "string" && entry.url.length > 0 ? entry.url : null,
      availability: isUnavailableEntry(entry) ? "unavailable" : "available",
    }));

    return {
      title: playlistTitle(root, identity.playlistId),
      members,
    };
  }
}
