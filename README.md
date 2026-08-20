<p align="center">
  <img src="assets/veta-banner.png" alt="veta — extract the valuable core of a video into clean notes" width="100%" />
</p>

# veta

Turn a YouTube URL into a clean, chaptered Markdown transcript — ready for you
or an AI agent to turn into real notes.

YouTube gives you **subtitles**: thousands of two-second fragments stuffed with
timing metadata. veta turns that noise into readable paragraphs, keeps the
video's chapters as headings, and deep-links every paragraph back to the exact
second in the video.

```sh
npm install -g @cmglezpdev/veta
veta doctor
veta "https://www.youtube.com/watch?v=Zdus-d4ehN0"
```

Prints the path to something like:

```text
ai-replacing-developers-has-officially-failed/transcript.md
```

## What you get

A folder named from the video title, containing `transcript.md`:

```markdown
# AI Replacing Developers Has Officially Failed

_Sajjaad Khader · 14:48 · https://www.youtube.com/watch?v=Zdus-d4ehN0_

## 1. Why Big Tech’s AI Experiment Failed

[`0:00`](https://www.youtube.com/watch?v=Zdus-d4ehN0&t=0) Big tech is in big
trouble. For years, they bet that AI would replace …

## 2. The Software Engineering Market Before AI

[`1:06`](https://www.youtube.com/watch?v=Zdus-d4ehN0&t=66) what's happening
with AI in this tech market …
```

That file is the product today. Hand it to Cursor, Obsidian, or
whatever you already use — veta does not write the notes for you.

Next to it, veta writes `prompt.md`: ready-made instructions for an AI
assistant working in that folder to turn `transcript.md` into structured,
timestamp-cited study notes. In an interactive terminal, `veta` offers to
copy the prompt after printing the transcript path — press Enter to accept,
anything else skips. Set `VETA_CLIPBOARD_CMD` to route the copy through a
custom command (it receives the text on stdin) instead of the platform
clipboard tool.

veta also downloads the video's cover image as `cover.<ext>` at the package
root; the prompt tells the assistant to copy it into the notes folder and
embed it at the top of the notes README. If the download fails, the run
continues without it.

## Quick path

1. **Node 24+** and a working [`yt-dlp`](https://github.com/yt-dlp/yt-dlp)
   on your `PATH` (`brew install yt-dlp` or `pipx install yt-dlp`).
2. Install the CLI:

   ```sh
   npm install -g @cmglezpdev/veta
   # or: pnpm add -g @cmglezpdev/veta
   ```

3. Check the extraction source:

   ```sh
   veta doctor
   ```

4. Extract:

   ```sh
   veta "https://www.youtube.com/watch?v=VIDEO_ID"
   # same thing:
   veta extract "https://www.youtube.com/watch?v=VIDEO_ID"
   veta extract VIDEO_ID --lang en
   ```

Packages live in `~/.veta`, regardless of where the command runs — they are
veta's state (raw downloads, run records, the transcript), not your notes.
The generated prompt points the AI assistant at the transcript inside
`~/.veta` and has the notes created in the assistant's own working directory
(your Obsidian vault, a project folder, wherever you opened it).
Override the data directory with `VETA_DATA_DIR`:

```sh
VETA_DATA_DIR=~/somewhere/else veta "https://www.youtube.com/watch?v=VIDEO_ID"
```

While it runs, veta reports each extraction step on stderr; stdout stays a
single line — the path to the result — so it is safe to pipe or capture.

Re-running the same video is safe: a finished extraction returns its existing
`transcript.md` without touching the network, and an interrupted one resumes
in the same package folder instead of starting over. Pass `--force` to discard
prior progress and extract from scratch — it removes only files veta writes,
never anything else you keep in the folder.

## Commands

| Command                              | What it does                                                                     |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| `veta <url>`                         | Extract captions → normalized `transcript.md`                                    |
| `veta extract <url> [--lang <code>]` | Same, with an explicit preferred language (BCP-47)                               |
| `veta extract <url> --force`         | Re-extract from scratch, discarding prior progress                               |
| `veta <playlist-url>`                | Extract every playlist member (see [Playlists](#playlists))                      |
| `veta <playlist-url> --only 2,5-8`   | Extract a subset of members — also `--skip-only`, `--skip`, `--limit`            |
| `veta doctor`                        | Show which `yt-dlp` binary will be used                                          |
| `veta list`                          | List stored extractions and their status, playlists with members grouped beneath |
| `veta purge`                         | Delete all stored extraction data, playlists included (asks for confirmation)    |
| `veta completion`                    | Print a shell completion script (zsh/bash)                                       |

## Playlists

A `youtube.com/playlist?list=...` URL runs every member through the same
extraction as a single video — no separate command:

```sh
veta "https://www.youtube.com/playlist?list=PLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

A `watch?v=...&list=...` URL still extracts just that one video; `list` is
ignored, exactly like today.

stdout prints exactly one line: the absolute path to the playlist's own
`prompt.md`. It casts the AI assistant as an **orchestrator** — spawn one
subagent per member video (each pointed at that member's own `prompt.md`),
then write a `<playlist-slug>/README.md` guide that ties every video's notes
together. Each member's notes land at `<playlist-slug>/NN-<video-slug>/`,
`NN` being the member's original 1-based playlist position.

A member that fails or is unavailable does not stop the run — the prompt
notes what is missing, and stderr prefixes every per-member line with
`[k/n] <title>`. If any member did not complete, veta still prints the prompt
path first, then exits non-zero.

### Curating members

Four flags narrow which members a run extracts. Every number refers to a
member's **original 1-based playlist position** — curation never renumbers,
so the `NN-` folder prefixes still index into the full playlist:

```sh
veta "<playlist-url>" --only 2,5-8       # just positions 2, 5, 6, 7, 8
veta "<playlist-url>" --skip-only 1,9    # everything except positions 1 and 9
veta "<playlist-url>" --skip 5 --limit 10  # like pagination: members 6–15
```

`--only` / `--skip-only` (mutually exclusive) filter by position first, then
`--skip` drops members from the front, then `--limit` caps what is left. In
`[k/n]`, `n` becomes the number of *selected* members and `k` counts through
them, while each member's own `NN` stays its original position. A position
past the end of the playlist matches nothing; a selection that matches no
members at all fails before anything is extracted. On a single-video URL
these flags are an error — they only mean something for playlists.

## Update notifications

When a newer release is on npm, veta prints a small box on stderr after the
command finishes — current version, new version, a changelog link, and the
update command for the package manager that installed it. The registry is
asked at most once every 24 hours; the answer is cached in
`~/.veta/update-check.json` (under `VETA_DATA_DIR` if set). The check only
runs in an interactive terminal and never affects the exit code.

Opt out with `NO_UPDATE_NOTIFIER=1` (or `VETA_NO_UPDATE_CHECK=1`); it is also
skipped automatically when `CI` is set.

## Requirements

| Need                             | Why                                                                   |
| -------------------------------- | --------------------------------------------------------------------- |
| Node.js ≥ 24                     | Runtime floor for the published package                               |
| `yt-dlp` on `PATH` (recommended) | Fetches metadata + captions; keep it updated yourself                 |
| Captions on the video            | No ASR fallback — if YouTube has no caption track, veta fails clearly |

Point at a specific binary with `VETA_YTDLP_PATH` if needed.

## Scope

veta will never generate the notes itself. It extracts, cleans, and hands off.
What ships next lives in [docs/08-roadmap.md](docs/08-roadmap.md).

## Learn how it works

The `docs/` folder is the real teaching material — design decisions with
evidence, not marketing:

| Start here                                |                                                  |
| ----------------------------------------- | ------------------------------------------------ |
| [Concepts](docs/01-concepts.md)           | Subtitles ≠ transcripts; the five words you need |
| [Architecture](docs/02-architecture.md)   | Layers and the import rule                       |
| [Normalization](docs/04-normalization.md) | 2,580 fragments → continuous text                |
| [Segmentation](docs/05-segmentation.md)   | Where paragraphs break, and why                  |
| [Roadmap](docs/08-roadmap.md)             | What ships next                                  |

Product intent lives in [`PRD.md`](PRD.md).

## Develop from source

Use **pnpm 11.17.0** (pinned in `package.json` as `packageManager`). Newer pnpm
versions may work, but this repo is tested against 11.17 — enable it with
Corepack:

```sh
corepack enable
corepack prepare pnpm@11.17.0 --activate
```

If global installs fail with “bin directory … is not in PATH”, run `pnpm setup`
once and reload your shell (`source ~/.zshrc`).

```sh
pnpm install
pnpm test
pnpm build
pnpm add -g .        # register the local `veta` bin globally
veta doctor
```

`pnpm link --global` was removed in pnpm 11; use `pnpm add -g .` instead. To
remove the local global install: `pnpm remove -g @cmglezpdev/veta`.

Details: [docs/06-development.md](docs/06-development.md).
Releases: [docs/07-releasing.md](docs/07-releasing.md).

## License

MIT
