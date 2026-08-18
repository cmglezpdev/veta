/**
 * Playlist identification and listing, kept separate from
 * {@link ExtractionSourcePort} (D1): a union return there would force
 * `runExtraction()` to narrow on it — the one file this feature promises
 * not to touch.
 */

export interface PlaylistIdentity {
  readonly sourceId: string;
  readonly playlistId: string;
  readonly canonicalUrl: string;
}

export interface PlaylistMember {
  /** 1-based ORIGINAL playlist position — the curation vocabulary. */
  readonly position: number;
  /** Null when the entry carried no usable id (e.g. a fully removed video). */
  readonly externalId: string | null;
  readonly title: string | null;
  readonly canonicalUrl: string | null;
  readonly availability: "available" | "unavailable";
}

export interface PlaylistSourcePort {
  readonly sourceId: string;
  /**
   * No network call. Null means the input is not a playlist request — the
   * caller falls back to the existing single-video identification path.
   * Throws `INPUT_UNRECOGNIZED` for mixes, Watch Later, and Liked Videos,
   * which look like playlists but are not ones this feature supports.
   */
  identifyPlaylist(input: string): Promise<PlaylistIdentity | null>;
  listMembers(identity: PlaylistIdentity): Promise<{
    readonly title: string;
    readonly members: readonly PlaylistMember[];
  }>;
}
