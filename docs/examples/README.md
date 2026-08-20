# Examples

Real command outputs captured for reference while designing features.

## `yt-dlp-flat-playlist.json`

Output of the playlist listing call used by playlist support:

```bash
yt-dlp --ignore-config --flat-playlist -J "https://www.youtube.com/playlist?list=PL9omX6impEuMgDFCK_NleIB0sMzKs2boI"
```

Captured with yt-dlp 2026.07.04. Internal fields (`__*`, `epoch`) were removed.

Key facts:

- Root object has `_type: "playlist"`, `id`, `title`, `description`, `playlist_count`, `uploader`, `channel`, `thumbnails`, `entries`.
- Each entry has `id`, `title`, `duration`, `url`, `thumbnails`, `channel`. Entries do NOT carry `playlist_index` in `-J` mode; the original 1-based position is the entry's index in `entries` (`--dump-json` NDJSON mode does include `playlist_index` per line).
- `availability` and `live_status` are `null` on entries in flat mode.
- Roughly 1.6 KB per entry: large playlists exceed the default 1 MiB `execFile` buffer.
