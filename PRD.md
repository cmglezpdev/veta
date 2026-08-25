# veta — Product Requirements Document

## 1. Summary

`veta` is a CLI tool that turns raw video content (starting with YouTube) into a clean, structured package — metadata, chapters, and a normalized transcript — plus a ready-to-run prompt that hands that package to an AI coding agent (Claude Code, Cursor, Codex, or any other) to generate organized Markdown notes in an Obsidian-compatible vault.

`veta` never generates the notes itself. It extracts, normalizes, and hands off. The AI agent is the one writing content, using the prompt `veta` produces.

## 2. Problem Statement

Studying long-form video content (courses, talks, interviews), often in a non-native language, while manually taking notes is inefficient: attention splits between watching and writing, and the resulting notes are shallow. The raw material needed to produce good notes already exists inside the video (title, chapter markers, spoken content) but is not in a form an AI model — or a human — can use directly.

Two more things exist today but aren't packaged as a workflow: agentic coding CLIs are excellent at synthesizing structured Markdown from raw text, and Obsidian is just a folder of Markdown files, so there is no “integration” to build — only a well-formed input to produce.

## 3. Goals

- Turn one video URL into a complete, disk-based package: title, cover image, chapter list, normalized transcript.
- Produce a hydrated, ready-to-use prompt referencing that package, targeting any AI agent CLI the user configures — not a fixed set of tools.
- Keep the output idempotent and safe to re-run: never silently destroy user-edited content.
- Ship as an installable/runnable CLI (`npx`, global install, or standalone binary) with exactly one external runtime dependency: a `yt-dlp` binary the user installs and keeps current themselves.

## 4. Non-Goals (v1)

- No AI-generated summaries, notes, or content of any kind. `veta` stops at "prompt produced."
- No built-in integration with any specific agent CLI (Claude Code, Cursor, Codex, etc.). `veta` only knows about a user-configured command template.
- No Obsidian API/plugin integration. The vault is just an output directory.
- No playlist support. One video per invocation.
- No web UI, TUI, or desktop app.
- No audio-to-text (ASR) fallback. If a video has no caption track, `veta` fails with a clear message.
- No non-YouTube video sources online (no Vimeo scraping, no Twitter/X scraping, etc.).

## 5. Scope

### 5.1 In scope — v1 (YouTube)

- Input: a single YouTube video URL.
- Extraction via `yt-dlp` (metadata, chapters, and captions all come from this single source):
  - Title, video ID, publish date, duration, uploader, canonical URL — from `--write-info-json`.
  - Cover/thumbnail (highest available resolution), downloaded as an image file.
  - Chapter list, if present (title + start **and end** timestamps) — present in the same `--write-info-json` payload, not a separate fetch.
  - Caption track in `json3` format: prefer manual captions (`subtitles`) over auto-generated (`automatic_captions`); download in a user-selected language or fall back to the video's original language.
- Transcript normalization (from `json3`):
  - Skip non-content filler events (those whose only segment is a newline).
  - Join word-level `segs` and adjacent events with correct whitespace.
  - Re-segment into readable paragraphs with periodic timestamps.
  - If chapters exist, split the normalized transcript per chapter.
  - Each timestamp/section links back to the exact moment in the video (`&t=<seconds>s`).
- Local persistence: a per-video folder containing metadata (JSON), the cover image, and the normalized transcript (plus chapter-split files, if applicable).
- A local index (separate from config) tracking processed video IDs, to detect re-runs.
- Prompt generation: a template hydrated with the video's metadata, chapter list, and transcript file paths/content, describing the desired note structure (lowercase-and-dash file names, numbered ordering, subfolders as needed, an `INDEX.md`/`README.md` at the root, Mermaid diagrams where useful) — output language configurable independently from transcript language.
- Delivery of that prompt via:
  - Launching a user-configured agent command with the prompt file as input, or
  - Copying the prompt to the clipboard, or
  - Printing/writing the prompt to a file — selectable via an interactive prompt when running in a TTY, and via flags/config when not (non-interactive mode never blocks on a menu).
- Configuration (XDG-compliant) for: default output directory (e.g., an Obsidian vault path), default transcript language, default summary/output language, agent command template.

### 5.2 Out of scope for v1, planned for a later phase

- Accepting a local video/audio file as input (for content with no official captions, e.g. downloaded from other platforms).
- ASR (speech-to-text) transcription for such inputs, via a local or API-based model — configurable, since it introduces real dependencies (audio extraction, model selection, cost).
- Once introduced, this becomes a second transcript source alongside YouTube captions; downstream processing (normalization, chapter-splitting, prompt generation) is shared.

### 5.3 Explicitly permanent non-goals

- Scraping video from arbitrary third-party sites (Twitter/X, etc.). If a user needs a video from elsewhere, they download it themselves and pass the local file to `veta` (once local-file input ships). `veta` does not fight platform permissions or DRM.
- Playlists.
- Any UI beyond the CLI (a UI may be considered far in the future but is not part of this product's near-term direction).

## 6. Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-1 | Given a YouTube URL, the CLI extracts title, video ID, publish date, and thumbnail image. |
| FR-2 | The CLI extracts the chapter list when the video defines one, capturing each chapter's title, **start time, and end time**. `yt-dlp` supplies all three in the same payload at no extra cost, and chapter-aware transcript splitting (FR-8) is not implementable without an end boundary. |
| FR-3 | The CLI downloads the caption track, preferring manually-created captions over auto-generated ones for the same language. (`yt-dlp --write-info-json` exposes these as two distinct maps — `subtitles` for manual tracks and `automatic_captions` for ASR — so the preference is a direct lookup, not an inference.) |
| FR-4 | The user can select the transcript language explicitly. The default resolves in this order: (1) a manual caption track in the video's original language, (2) any manual track, (3) the auto-generated track in the video's original language. The video's original language is read from `yt-dlp`'s `language` field (verified present, e.g. `"en-US"`; normalize to its base subtag). "First available" is not a usable rule — YouTube lists ~157 machine-translated auto-caption languages for a typical video, and picking arbitrarily from that list yields a translation-of-ASR result. |
| FR-5 | If only an auto-generated caption track is available, the CLI proceeds but surfaces a visible quality warning. |
| FR-6 | If no caption track exists in any language, the CLI fails with a clear, actionable error and produces **no prompt and no notes** — the run does not "half succeed" from the user's perspective. Artifacts already fetched before the failure (metadata, thumbnail) remain on disk as resumable pipeline state per FR-14, with the video's state recorded as incomplete; this is deliberate and is not considered partial output, because nothing downstream consumes it until the pipeline completes. |
| FR-7 | The CLI normalizes raw `json3` captions into clean, readable text: skipping non-content filler events (those whose only segment is a newline), joining word-level `segs` and adjacent events with correct whitespace (naive concatenation produces run-together words such as `"easier,but then"`), parsing `tStartMs`/`tOffsetMs` into usable timestamps, and re-segmenting into paragraphs with periodic timestamps. Rolling duplication and inline `<c>` markup are VTT-format artifacts and do not occur in `json3`. |
| FR-8 | When chapters are present, the CLI splits the normalized transcript into one section per chapter. |
| FR-9 | Every timestamp/section in the output links to the exact moment in the source video. |
| FR-10 | The CLI persists metadata (JSON), cover image, and transcript(s) to a per-video folder named from download date + slug; the video ID (not the folder name) is the durable identity used for re-run detection. |
| FR-11 | Re-running the same video ID skips existing output by default; an explicit `--force` flag allows overwriting from scratch. |
| FR-12 | The CLI maintains a local index of processed videos, separate from user configuration. |
| FR-13 | Each video's processing is modeled as an explicit, ordered state machine (e.g. `metadata_fetched` → `thumbnail_downloaded` → `captions_downloaded` → `chapters_parsed` → `transcript_normalized` → `prompt_generated`), persisted step-by-step in the local index as each step completes. |
| FR-14 | If a run is interrupted (error, lost connection, process kill) and re-invoked, the CLI resumes from the first incomplete step by default — it never re-fetches or re-downloads steps already marked complete, and never requires a full restart to recover from a partial failure. |
| FR-15 | The CLI generates a prompt file that embeds/references the video metadata, chapter list, and transcript, and instructs the target AI agent on note structure and file naming conventions (lowercase-dash names, numbering, subfolders, root `INDEX.md`/`README.md`, Mermaid diagrams where useful). |
| FR-16 | The summary/output language for the generated notes is configurable independently from the transcript language. |
| FR-17 | The user can configure: output directory (e.g. Obsidian vault path), default transcript language, default summary language, and an agent command template (e.g. `claude {prompt_file}`). |
| FR-18 | After generating the prompt, in an interactive (TTY) session, the CLI offers to: launch the configured agent command, copy the prompt to clipboard, or just leave the file on disk. |
| FR-19 | In a non-interactive session (no TTY, or `--no-interactive`/CI), the CLI never blocks on a menu; it performs a predictable default action (write prompt file) unless flags say otherwise. |
| FR-20 | The CLI never invokes any specific third-party agent CLI by name or hardcoded logic — only the user-configured command template. |
| FR-21 | While running, the CLI renders a live, per-step task list showing what is currently happening (spinners for in-progress steps, checkmarks for completed ones, clear markers for failed ones), with color-coded status — not silent, unlabeled waiting. |
| FR-22 | When resuming a previously interrupted run, the task list UI reflects prior progress immediately (steps already done show as complete from the start, not re-animated), so the user sees exactly where the run picked up. |
| FR-23 | The CLI ships shell completion (at minimum zsh; bash as a byproduct) for subcommands and flags, installable the way `git`/`docker` completions are — so partially-typed commands and flag names autocomplete. |
| FR-24 | The CLI resolves the `yt-dlp` binary from an explicit override (`VETA_YTDLP_PATH`) first, then a user-managed installation found on `PATH`. The resolved source and version are discoverable by the user (`veta doctor`). |
| FR-25 | When the resolved `yt-dlp` binary is stale, or when an extraction fails in a way consistent with upstream drift, the CLI surfaces a distinct warning naming the binary's source and version and giving the exact command to update it — so the failure is never misattributed to `veta` itself. Staleness is directly computable: `yt-dlp` versions are release dates (`2026.07.04`), so the check is the age of the resolved binary's version against the current date, with the threshold defined at design time. |
| FR-26 | `--force` re-runs extraction only within `veta`'s own per-video data directory. It never modifies, overwrites, or deletes anything in the user-configured output/vault directory, where agent-generated and possibly hand-edited notes live. |

## 7. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | **Exactly one external runtime dependency: the `yt-dlp` binary**, resolved from `VETA_YTDLP_PATH` or `PATH` and installed by the user (`brew install yt-dlp`, `pipx install yt-dlp`). veta neither downloads nor bundles it: installing veta must never run an install script or touch the network. If the binary is missing or unusable, the CLI fails with actionable install instructions rather than an opaque error. *(Revised twice: the original "zero external dependencies" goal proved unattainable — see §9 — and the automatic install-time download that replaced it was dropped in 0.11.0; see docs/06.)* |
| NFR-2 | **Idempotent by default.** Any operation that could destroy user-authored content (notes already written by an agent into the vault) never happens without an explicit, opt-in flag. |
| NFR-3 | **Config/state separation.** User-editable configuration and program-maintained state (the processed-video index) live in separate files, following XDG Base Directory conventions (`~/.config/veta/`, `~/.local/share/veta/`). |
| NFR-4 | **Scriptable.** Every interactive behavior has a non-interactive equivalent reachable via flags, so the tool is usable in scripts/automation. |
| NFR-5 | **Resilient to platform drift.** All parsing of `yt-dlp`'s output (the `--write-info-json` metadata/chapter payload and the `json3` caption payload) is isolated behind a single adapter module with its own fixtures and tests, so a change in either payload shape is a contained, cheap patch rather than a diffuse breakage. Fixtures are captured from real payloads, not hand-authored. |
| NFR-6 | **Filesystem-safe naming.** Folder and file names never use raw video titles verbatim; unsafe characters (`/`, `:`, emoji, etc.) are stripped/slugified. |
| NFR-7 | **Distributable with minimal friction.** Installable via `npx @cmglezpdev/veta`, global npm install, or a standalone compiled binary (evaluated post-v1). |
| NFR-8 | **Clear failure messages.** Every failure mode defined in the functional requirements (no captions, language not found, agent command missing, etc.) produces a human-readable, actionable error — never a raw stack trace as the only output. |
| NFR-9 | **Testable core.** Transcript normalization, chapter parsing, and prompt hydration are pure functions with unit test coverage, independent of network access. |
| NFR-10 | **Resumability is a property of the pipeline, not an afterthought.** Each processing step is individually observable and re-startable from persisted state; a crash or interrupted network call loses at most the current step's work. |
| NFR-11 | **Visually legible by default.** Progress, current action, and errors are always communicated through the terminal UI (task list, spinners, color, checkmarks) — a user should never stare at a silent terminal wondering if the process is alive or stuck. |
| NFR-12 | **Broad end-user compatibility.** As a tool other people install and run, the minimum supported Node.js version favors what most users already have (an LTS line), not the newest release, unless there's a concrete feature dependency that requires otherwise. |
| NFR-13 | **Reproducible, automated releases.** Version bumps, changelog generation, git tagging, and npm publication are automated from commit history — never performed by hand-editing `package.json` and running `npm publish` locally. |
| NFR-14 | **No long-lived publish credentials.** Publication authenticates via OIDC trusted publishing; no npm write token is stored as a repository secret. |
| NFR-15 | **Verifiable supply chain.** Every published version carries provenance linking the artifact to the exact source commit and workflow run that produced it, and is reachable from an immutable git tag. |
| NFR-16 | **Stable public contract.** The user-facing surface (commands, flags, config schema, on-disk output shape, exit codes) is treated as the versioned public API under SemVer; changes to it follow the bump rules in §11.1. |
| NFR-17 | **Layered architecture with inverted dependencies at real boundaries.** The codebase follows Clean/Hexagonal principles: domain and application logic depend on interfaces (ports), never on concrete external libraries. The two boundaries that genuinely warrant ports are (a) the transcript/metadata source — `yt-dlp` today, ASR in Phase 2 — and (b) persistence — flat JSON today, potentially SQLite later. Layering is not applied ceremonially where the logic is a straight pipeline. |
| NFR-18 | **Tests exercise real seams, not mocked internals.** Domain logic is tested as pure functions with no test doubles; application logic is tested against hand-written fake implementations of its ports. Framework-level module mocking is reserved for the infrastructure boundary — needing it in domain or application code is treated as a signal of a coupling defect, not a testing problem. |

## 8. Technology

| Concern | Choice | Rationale |
|---|---|---|
| Language/runtime | TypeScript on Node.js (minimum: latest Active LTS — Node 24 as of mid-2026) | `npx`-first distribution needs no separate runtime install for most users. Targeting the Active LTS line (not the newest Current release, e.g. Node 26, which only enters LTS in October 2026) maximizes the odds that an end user's already-installed Node works out of the box. |
| YouTube extraction | **`yt-dlp`**, a user-installed binary invoked directly via `execFile` (no wrapper package, no install-time download) | **This reverses an earlier decision; see §9 for the full rationale.** A live spike (2026-07-28) proved `youtubei.js` cannot retrieve transcript content at all — YouTube's PO Token gate returns HTTP 400 `FAILED_PRECONDITION` from `getTranscript()` and an empty 200 from the caption `base_url`. `yt-dlp` retrieves captions successfully and, via `--write-info-json`, also supplies title, id, `upload_date`/`timestamp`, duration, uploader, thumbnail, available caption languages, and chapters **with both `start_time` and `end_time`**. One dependency covers the entire extraction surface. |
| Caption format | `json3` (via `--sub-format json3`), not VTT | Measured on real data: `json3` returns structured word-level events (`segs[{utf8, tOffsetMs}]`) with no rolling duplication and no inline markup, whereas VTT carries both. Normalizing from `json3` is materially simpler and less lossy. |
| CLI framework | `yargs` | Verified: has built-in shell completion generation (zsh/bash), required by FR-23. `commander` (the more common default) requires hand-built completion; `oclif` also has built-in completion but is an enterprise-scale framework (plugin system, built for CLIs with hundreds/thousands of commands) — disproportionate for this tool's surface area. |
| Terminal UI — task list | `listr2` | Verified actively maintained (v11, released within days as of this writing). Purpose-built for FR-21/FR-22: a live, resumable-aware task list with per-step spinner/checkmark/failure states — already includes its own spinner rendering, so no separate spinner package (e.g. `ora`) is needed on top of it. |
| Terminal UI — colors/styling | **Native**: `node:util`'s `styleText()` | Stable since Node 22.13 (our LTS floor is Node 24, so always available); supports the standard ANSI palette plus hex colors as of Node 26.1. Covers all ad-hoc coloring outside `listr2`'s own output (warnings, errors, headers) with zero added dependency — no `chalk`/`picocolors` needed. |
| Terminal UI — selection prompts | `@clack/prompts` | Needed for FR-18 (choose: launch agent / copy / write file) and any future select-style prompt. ~2KB, TypeScript-native, actively maintained. Preferred over `inquirer` (heavier, more general-purpose) since our prompt surface is small and simple. |
| Command-line argument parsing | **Native `util.parseArgs()`, considered and rejected for this role** | It exists and removes a dependency in principle, but it's low-level: no subcommands, no help-text generation, no shell completion. FR-23 needs real completion, so `yargs` (already chosen) remains the right call; `parseArgs` isn't a fit here. |
| Clipboard access | `clipboardy` | No native Node clipboard API exists. `clipboardy` (by the same author ecosystem as many popular zero-bloat CLI tools) is cross-platform (macOS/Windows/Linux, including Wayland) and actively maintained — needed for FR-18's "copy to clipboard" delivery option. |
| Config/state format | JSON, XDG-compliant paths, read/written via native `node:fs` | Simple, diffable, no extra dependency (no `conf`/`cosmiconfig` needed for a single flat JSON file); config and index are separate files. The index additionally stores the per-video pipeline state machine (FR-13). |
| Testing | `vitest` (devDependency) | Chosen over Jest and over the native `node:test` runner. **vs. Jest:** Jest's ESM support remains behind `--experimental-vm-modules`/Babel transforms in 2026, and ESM module mocking requires `jest.unstable_mockModule` + dynamic `import()`; this project is `"type": "module"` + TypeScript, exactly Jest's weakest combination. **vs. `node:test`:** the native runner is genuinely capable (stable `mock.fn()`/`mock.method()`, `--test --watch`, TS type-stripping unflagged on Node 24) and costs zero dependencies, but Vitest's ecosystem familiarity lowers the barrier for outside contributors on an open-source project. NFR-1 does not apply — a test runner is a devDependency and never reaches end users. |
| Type checking | `tsc --noEmit` as a separate CI step | Node's TypeScript support (and Vitest's transform pipeline) **strips** types without checking them. Type safety requires an explicit `tsc --noEmit` gate; this is not optional. |
| Packaging | npm package `@cmglezpdev/veta`, binary name `veta` | Package name and binary name are independent; scoped package avoids name squatting, short binary name optimizes for daily typing. |
| Distribution (stretch) | Compiled standalone binary (e.g. via Bun) | Considered for a later phase if `npx` friction turns out to matter for adoption; not required for v1. |
| Docker | Not planned | A local tool that writes into a user's Obsidian vault gains nothing from containerization (volume mounts, permissions overhead) versus a native/binary install. |

## 9. Key Design Decisions & Rationale

- **Prompt-only output, no generated content.** Keeps `veta` decoupled from any specific AI provider or model; the value is in producing clean, complete input, not in competing with agent CLIs at writing notes.
- **Config-driven agent invocation, not hardcoded integrations.** `veta` never imports knowledge of Claude Code, Cursor, or Codex specifically. The user supplies a command template; this survives any of those tools changing their interface, disappearing, or being replaced by a new one.
- **Obsidian is just a directory.** No plugin, no API client — the "integration" is simply pointing the output directory at a vault path.
- **Two independent language axes.** Transcript language (what was said) and summary language (what the agent should write) are configured separately, since a user may want, e.g., an English transcript summarized into Spanish notes.
- **Manual captions preferred over auto-generated.** Auto-generated (ASR) captions lack reliable punctuation and sentence boundaries; auto-translated captions compound that with translation-of-ASR errors. `veta` always prefers a manual track when available and downloads the original language by default, leaving translation to the AI agent at the notes stage. (Note: "rolling duplication" is a VTT *format* artifact, not a property of ASR content — it does not appear in `json3`. See §8's caption-format row.)
- **Video ID as durable identity, folder name as cosmetic.** The per-video download folder is named from download date + slug for human readability, but re-run detection is keyed on the video ID stored in the local index — never on the folder name.
- **No source abstraction in v1.** With YouTube as the only real-time source, no `VideoSource` interface or plugin system is introduced prematurely. A local-file input path is deferred to Phase 2 and will justify that abstraction only once it exists.
- **No ASR in v1.** Speech-to-text requires audio extraction and a transcription model (local or API-based), a disproportionate scope increase for a first release. Videos without any caption track fail clearly rather than falling back silently to a lower-quality path.
- **Per-video state machine instead of an all-or-nothing run.** Extraction is a multi-step pipeline (metadata → thumbnail → captions → chapters → normalization → prompt). Each step's completion is persisted independently in the local index, so a network failure or crash mid-pipeline only costs the in-flight step — resuming re-enters exactly where it left off instead of re-downloading everything. This is the same idempotency principle from NFR-2, made explicit at the step level rather than only at the whole-video level.
- **Extraction backend reversed from `youtubei.js` to `yt-dlp` (2026-07-28), on empirical evidence.** The original decision favored `youtubei.js` to avoid any external binary. A live spike disproved its viability: `getTranscript()` returns HTTP 400 `FAILED_PRECONDITION` under every client configuration tried (default, explicit lang/location, `ClientType.WEB`, `generate_session_locally`), and fetching the caption track's `base_url` directly returns **HTTP 200 with a zero-byte body** — the URL carries YouTube's `&exp=xpe` PO Token gate. Every non-transcript capability worked correctly (metadata, thumbnails sorted highest-first, ASR detection via `caption_tracks[].kind`, and 21 chapters parsed from `markers_map`), so the failure is specific and unavoidable, not a misconfiguration. The remaining pure-JS option — generating PO Tokens by executing YouTube's BotGuard challenge in a JS VM — was rejected: it commits the project to an indefinite cat-and-mouse game against Google's anti-bot systems, which is the wrong ongoing maintenance burden for a note-taking tool. `yt-dlp` exists precisely because a dedicated community sustains that fight; depending on it is a deliberate trade of dependency-freedom for reliability. It also proved *strictly* better on capability, supplying chapter `end_time` values that `youtubei.js` omits.
- **Transcript length vs. agent context budget: not a v1 concern, by measured numbers.** Measured on a real 81-minute podcast-style video: 16,023 words at ~198 words/minute, normalizing to 95,020 characters ≈ **23,700 tokens**. Extrapolating, a 2.5-hour video lands near 44,000 tokens — comfortably inside even a conservative 250K-token agent context window, let alone a 1M-token one. This holds *only after* normalization: the same video's raw VTT is 917,848 characters ≈ **229,000 tokens** (a **9.7x** difference), which would consume roughly 92% of a 250K context window for a single video. Raw `json3` is larger still at ~303,000 tokens. This is the quantified case for normalization being the product's core value, independent of readability. Given these numbers, v1 always passes the full normalized transcript to the agent for chapter inference when no chapters exist; auto-splitting a single video's transcript across multiple sub-agent calls is deferred (see Open Questions) and only worth revisiting if real-world usage shows a genuine long-tail case exceeding budget.

## 10. Roadmap

- **Phase 1 (this PRD's primary scope):** YouTube-only extraction, transcript normalization, chapter-aware splitting, prompt generation and delivery.
- **Phase 2:** Accept a local video/audio file as input (for content without official captions, downloaded by the user from elsewhere); add ASR-based transcription (local or API-based model, configurable) as a second transcript source feeding the same normalization/prompt pipeline.
- **Phase 2b — user-supplied subtitle files (`.srt`, `.vtt`):** Accept an existing subtitle file directly, for the common case where a user already has captions for content from elsewhere and no transcription is needed at all. This requires no change to the domain: the architecture already routes every source through a format-neutral `CaptionCue[]` boundary, so each new format is one additional adapter. **Caveat to handle at that time:** SRT/VTT end timestamps mean "when the subtitle leaves the screen", not "when speech stopped" — for hand-authored subtitles these usually coincide, but auto-generated VTT exhibits the same overlap that made `json3`'s `dDurationMs` unusable (see §9). Those adapters must clamp or re-derive end times to preserve the `cue[i].endMs <= cue[i+1].startMs` invariant that the domain's paragraph segmentation depends on.
- **Future, unscheduled:** Standalone compiled binary distribution; possible UI layer on top of the same core (not currently planned).

## 11. Versioning, Release & Publishing Process

### 11.1 Versioning policy (SemVer)

The project follows Semantic Versioning (`MAJOR.MINOR.PATCH`). For a CLI tool, the **public API is the user-facing contract**, not internal TypeScript types:

| Change | Bump |
|---|---|
| Removing or renaming a command or flag | MAJOR |
| Changing the config file schema in a non-backward-compatible way | MAJOR |
| Changing the on-disk output structure or metadata JSON shape relied upon by users | MAJOR |
| Changing exit codes or machine-readable output format | MAJOR |
| Adding a new command, flag, or optional config key | MINOR |
| Bug fixes, error-message improvements, performance work | PATCH |

Internal refactors, dependency bumps, and TypeScript type changes that do not alter the CLI surface are **not** breaking changes.

**Pre-1.0 policy:** the project starts at `0.1.0` and stays in the `0.x` range while the command/flag surface is still stabilizing. `1.0.0` is published only once the CLI surface is considered stable enough that breaking it warrants a major bump. (Note: `1.0.0` in a freshly scaffolded `package.json` is `npm init`'s default, not a deliberate stability claim.)

### 11.2 Branching and merge flow

- `main` is always releasable but **being on `main` does not mean released** — merging and releasing are separate, deliberate acts.
- All work happens on topic branches (`feat/…`, `fix/…`, `chore/…`), merged into `main` via pull request.
- All commits follow **Conventional Commits** (`feat:`, `fix:`, `chore:`, with `BREAKING CHANGE:` in the body where applicable). This is a functional requirement of the release automation, not a style preference — commit prefixes are the input that determines version bumps and changelog content.

### 11.3 Release automation

Releases are automated with **`release-please`**, chosen over the alternatives for these reasons:

- **vs. `semantic-release`**: `semantic-release` publishes on every merge to `main` with no human gate; `release-please` maintains a persistent "Release PR" that accumulates pending changes and their generated changelog, so a release is an explicit, reviewable decision.
- **vs. `changesets`**: `changesets` requires authoring a separate changeset file per change — valuable for multi-package/multi-contributor repos, but redundant ceremony for a single-package project that already uses Conventional Commits.

Release flow:

1. Topic branch → PR → merge to `main` (with Conventional Commit messages).
2. `release-please` opens/updates a Release PR containing the computed version bump and the accumulated `CHANGELOG.md` entries.
3. Reviewing and merging that Release PR is the act of releasing: it creates the git **tag** (`v0.2.0`) and the corresponding **GitHub Release** with generated notes.
4. The published tag/release triggers the npm publish workflow.

### 11.4 Publishing to npm

- Published as `@cmglezpdev/veta` (scoped, public access) with binary `veta`.
- Publishing uses **npm Trusted Publishing via OIDC** (generally available since July 2025) rather than a long-lived `NPM_TOKEN` repository secret: npm is configured to accept publishes only from this repository's specific release workflow, so there is no publishable credential to leak. Requires `id-token: write` permission on the publishing job.
- **Provenance attestations** are generated (emitted by default under trusted publishing), cryptographically linking each published artifact to the source commit and workflow that produced it.
- CI must run the full test suite and a build before any publish step; a failing test suite blocks the release.

## 12. Open Questions

- Whether/how ASR model selection (local vs. API-based) is configured in Phase 2.
- Exact schema of the local processed-video index, its per-video state machine, and per-video metadata JSON (to be defined at design time).
- Whether chapter-less, unusually long transcripts ever need automatic sub-agent-based chapter inference/splitting — deferred until real usage shows the flat "pass the whole transcript" approach hitting a genuine context-budget wall (see §9).
