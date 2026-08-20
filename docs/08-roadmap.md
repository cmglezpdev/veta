# 8. Roadmap — where we are

**Current state:** `v0.10.0` is released; `main` additionally carries playlist
support end to end (PRs [#40](https://github.com/cmglezpdev/veta/pull/40)–
[#46](https://github.com/cmglezpdev/veta/pull/46)) and the update-available
notice (PR [#39](https://github.com/cmglezpdev/veta/pull/39)), awaiting the
next release. Every slice of the original plan has shipped: extraction,
resume/`--force`, prompt generation, progress UX, `list`/`purge`, playlists.

**Next candidates** (nothing committed to yet):

- ~~Playlist curation flags: `--limit` / `--skip` / `--only` / `--skip-only`.~~
  **Done** — on `main`, awaiting release.
- Revisit prompt UX against real usage.
- Long-deferred polish: doctor polish, speaker-change paragraph breaks
  (`isSpeakerChange`), tightening `assignChapters` vs `Chapter.endSec`.
  Persistent config was dropped for good — veta takes flags/env per run.

This file is the living plan. Engram keeps the same picture under
`veta/roadmap`. Prefer this document when you need to reorient; Engram is
backup across sessions.

---

## Quick path

1. ~~Slice 2: port + yt-dlp adapter.~~
2. ~~Slice 3: slug, exit-code map, minimal CLI → `transcript.md`.~~
3. ~~Slice 4: CLI shell (`yargs`, completion, doctor).~~
4. ~~Slice 5: StorePort, run domain, FsStore, `extract` on the port (catalog PR-6).~~
5. ~~Slice 6: pipeline runner with real resume and `--force` (catalog PR-8).~~
6. ~~Prompt generation + Enter-to-copy delivery.~~
7. ~~Progress UX: typed pipeline events + hand-rolled stderr renderer.~~
8. ~~Global `~/.veta` home, cover download, `list` / `purge`.~~
9. ~~Playlist support: identify, orchestrate per-member, CLI auto-detect.~~
10. ~~Playlist curation flags: `--limit` / `--skip` / `--only` / `--skip-only`.~~
11. **Now:** pick from the next candidates above — the prompt-UX revisit.

---

## Strategy that got us here: Route B (complete) → CLI shell → persistence

We abandoned following the original 12-PR checklist in order. Reality had
drifted: normalization and tests landed ahead of ports/CLI, empty folders
existed for store/pipeline/ports, and the calibration gate needed more real
videos before store/resume complexity paid off.

**Route B** = thin vertical slice toward a working `veta <url>` — **done**.

**User decision (Aug 2026):** ship the CLI shell (`yargs`, completion,
doctor) **before** StorePort/resume so the command surface stabilizes first.


| Slice | Goal                                                    | Status                                                                                  |
| ----- | ------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1     | Choose the right caption track before fetching anything | **Done** — PR [#5](https://github.com/cmglezpdev/veta/pull/5), on `main` as of `v0.2.1` |
| 2     | Talk to yt-dlp for real (port + adapter)                | **Done** — PR [#7](https://github.com/cmglezpdev/veta/pull/7), on `main`                |
| 3     | Minimal CLI: URL → package folder + `transcript.md`     | **Done** — PR [#8](https://github.com/cmglezpdev/veta/pull/8), on `main`                |
| 4     | CLI shell: `yargs`, completion, doctor, `--lang`        | **Done** — PR [#10](https://github.com/cmglezpdev/veta/pull/10), on `main`              |
| 5     | Persist run state; resume / safe reset primitives       | **Done** — PRs [#15](https://github.com/cmglezpdev/veta/pull/15)–[#18](https://github.com/cmglezpdev/veta/pull/18), on `main` |
| 6     | Pipeline runner: real resume, `--force`                 | **Done** — PRs [#22](https://github.com/cmglezpdev/veta/pull/22)–[#24](https://github.com/cmglezpdev/veta/pull/24), shipped in `v0.5.0` |

**No longer deferred — prompt generation shipped.** `runExtraction` now builds
`prompt.md` (pure `domain/prompt/build-prompt.ts`) beside `transcript.md` and
records `prompt_generated` as `complete`. `thumbnail_downloaded` is implemented
too: the cover lands as `cover.<ext>` at the package root and the prompt tells
the assistant to copy it into the notes folder and embed it at the top of the
README; a failed or unavailable download records `skipped` and never fails the
run. Finished packages from before these slices keep their recorded steps and
are never rebuilt — the short-circuit reports a `null` prompt path for them. In a
TTY, `veta extract` offers the prompt on stderr and copies it to the clipboard
on plain Enter (`VETA_CLIPBOARD_CMD` overrides the platform command); stdout
stays the single transcript-path line.

The original 12-PR SDD checklist still lives in Engram (`sdd/veta-v1/tasks`).
Treat it as a **parts catalog**, not the current sequence. Slice 4 maps to
catalog **PR-9**; store/resume maps to **PR-6**; the pipeline that consumes
resume maps to **PR-8**.

---



## Already on `main`


| What                                                               | Evidence                                                                                            |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Tooling, fixtures, release rails                                   | Scaffolding + `v0.2.0` / `v0.2.1`                                                                   |
| Transcript pipeline (cue → join → chapters → segment → render)     | PR [#2](https://github.com/cmglezpdev/veta/pull/2)                                                  |
| Test net (~80→120), calibration gate in CI, arch + PR-title guards | PR [#3](https://github.com/cmglezpdev/veta/pull/3), [#5](https://github.com/cmglezpdev/veta/pull/5) |
| Docs: squash vs merge-commit and release-please title reading      | PR [#4](https://github.com/cmglezpdev/veta/pull/4)                                                  |
| Caption track selection + `VetaError`                              | PR [#5](https://github.com/cmglezpdev/veta/pull/5)                                                  |
| `ExtractionSourcePort` + yt-dlp adapter                            | PR [#7](https://github.com/cmglezpdev/veta/pull/7)                                                  |
| Minimal CLI: slug + exit codes + `veta <url>` → `transcript.md`    | PR [#8](https://github.com/cmglezpdev/veta/pull/8)                                                  |
| CLI shell: `yargs`, completion, `doctor`, `--lang`                 | PR [#10](https://github.com/cmglezpdev/veta/pull/10)                                                |
| Pipeline runner: per-step run state, resume, `--force`, raw reuse  | PRs [#22](https://github.com/cmglezpdev/veta/pull/22)–[#24](https://github.com/cmglezpdev/veta/pull/24), `v0.5.0` |
| `prompt.md` generation + Enter-to-copy clipboard delivery          | PR [#26](https://github.com/cmglezpdev/veta/pull/26), `v0.6.0`                                      |
| Global `~/.veta` home; notes built in the assistant's cwd          | PR [#29](https://github.com/cmglezpdev/veta/pull/29), `v0.7.0`                                      |
| Cover download + key-takeaways prompt section                      | PRs [#31](https://github.com/cmglezpdev/veta/pull/31), [#32](https://github.com/cmglezpdev/veta/pull/32), `v0.8.0` |
| Step-by-step extraction progress on stderr                         | PR [#34](https://github.com/cmglezpdev/veta/pull/34), `v0.9.0`                                      |
| `veta purge` and `veta list`                                       | PRs [#36](https://github.com/cmglezpdev/veta/pull/36), [#37](https://github.com/cmglezpdev/veta/pull/37), `v0.10.0` |
| Playlist support end to end; update-available notice               | PRs [#39](https://github.com/cmglezpdev/veta/pull/39)–[#46](https://github.com/cmglezpdev/veta/pull/46), on `main`, unreleased |


`src/domain/config/` is gone for good — veta persists no config; `dataDir`
and language come from flags/env per invocation.

---



## Slice 2 — done (detail)

**Outcome:** something in-process can resolve a yt-dlp binary, invoke it,
classify failures, and implement `ExtractionSourcePort` — tested with a real
fake executable on `VETA_YTDLP_PATH` (zero `vi.mock`). On `main` via PR #7.


| Piece                                       | Responsibility                                    |
| ------------------------------------------- | ------------------------------------------------- |
| `ports/extraction-source.ts`                | Port interface (domain types only)                |
| `adapters/ytdlp/binary.ts`                  | PATH-then-bundled resolution; config/env override |
| `adapters/ytdlp/diagnose.ts`                | Map exit code + stderr → `VetaError` (pure)       |
| `adapters/ytdlp/invoke.ts`                  | Spawn with `--ignore-config`; wire diagnose       |
| `adapters/ytdlp/ytdlp-extraction-source.ts` | Port implementation                               |


---



## Slice 3 — done (detail)

**Outcome:** from a clean checkout, `veta <youtube-url>` produces a
readable `transcript.md` using the track selector from slice 1 and the
adapter from slice 2. Hand-rolled argv (no yargs). On `main` via PR #8.


| Piece                  | Responsibility                                 |
| ---------------------- | ---------------------------------------------- |
| `domain/video/slug.ts` | Safe per-video directory name                  |
| `cli/exit-codes.ts`    | Map every `VetaError.code` → exit status       |
| CLI extract path       | URL in → work dir + `transcript.md` out (thin) |


---



## Slice 4 — done (detail)

**Outcome:** proper CLI shell with `yargs` — backward-compatible
`veta <url>`, explicit `veta extract <url>`, `veta completion` (zsh
`#compdef`), thin `veta doctor`, and `--lang` on the extract path. Completion
short-circuits before adapter imports (D17 / FR-23). This PR closes the
catalog PR-9 surface; progress UX and prompt delivery have since shipped
(typed pipeline events plus a hand-rolled stderr renderer — no listr);
config persistence remains deferred.


| Piece                         | Responsibility                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `cli/cli-structure.ts`        | Shared command/flag registration; argv normalization for bare URLs             |
| `cli/completion.ts`           | `--get-yargs-completions` runner with no adapter side effects                  |
| `cli/run.ts`                  | `run()` / `main()` wiring extract + doctor through yargs                       |
| `cli/main.ts`                 | Composition root: completion short-circuit, then dynamic import of `run.ts`  |


**Out of scope for this PR (intentionally deferred):** StorePort, pipeline
`StepEvents`, listr progress UX, config persistence, prompt delivery,
`--force` resume. Progress UX has since landed — typed pipeline events and a
hand-rolled stderr renderer, not listr.

**Parts catalog ref:** Engram `sdd/veta-v1/tasks` → PR-9.

---



## Slice 5 — done (detail)

**Outcome:** persistence primitives so a run can be recorded, found again,
resumed at the first incomplete step, and safely reset under `--force` —
without yet owning the full pipeline orchestrator.

`extract.ts` no longer imports `node:fs`: it opens a work directory, renames it
once the title is known, and writes `transcript.md` through `StorePort`. The
layout it produces is unchanged — flat `{dataDir}/{dirName}/`.

Shipped as four chained PRs: 5a domain + port, 5b1 path/JSON primitives,
5b2 `FsStore`, 5c `extract` migration.


| Piece                         | Responsibility                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `domain/run/{steps,run-record,resume}.ts` | `STEP_ORDER`, `RunRecord`, `firstIncompleteStep` (pure resume semantics) |
| `ports/store.ts`              | `StorePort` — open work dir, save/find run, write artifacts, reset             |
| `adapters/store/paths.ts`     | `resolveWithin` — no path escape                                               |
| `adapters/store/atomic-json.ts` | temp + rename atomic JSON writes                                             |
| `adapters/store/fs-store.ts`  | Real `FsStore`: `state.json` / `index.json`, self-heal, safe `resetWorkDir`    |


**What “resume” means here:** the domain + store know *where a run left
off* and can rewrite run state atomically. They do **not** yet re-drive
yt-dlp / normalize from that point — that wiring is the pipeline slice
(catalog PR-8).

**`--force` blast radius (store half):** `resetWorkDir` deletes only the
enumerated artifact set inside a video work dir (never `rm -rf` the dir,
never touches `outputDir`). Pipeline-level guarantees that `--force` only
reaches store methods with a work dir under `dataDir` land with PR-8.

**Out of scope for this slice:** pipeline `run-extraction` / `StepEvents`,
progress renderers, prompt delivery. Persistent config was dropped outright —
`dataDir` and language come from flags/env per invocation.

**Known gap carried to Slice 6:** `extract` writes no `state.json`, so
re-extracting a video whose package directory already exists fails with
`WORK_DIR_EXISTS` instead of reusing it. Telling "the same video again" apart
from "a different video with the same title" needs the identity that resume
persists.

**Parts catalog ref:** Engram `sdd/veta-v1/tasks` → PR-6 (T6.1–T6.6).

---



## Slice 6 — done (detail)

**Outcome:** the thing Slice 5 was built for — a run that survives being
interrupted. Re-running `veta <url>` after a failure picks up where it stopped
instead of starting over. Shipped as PRs
[#22](https://github.com/cmglezpdev/veta/pull/22)–[#24](https://github.com/cmglezpdev/veta/pull/24)
in `v0.5.0`. What follows is the plan as it stood before the slice landed,
kept as history.

Slice 5 left five store methods with no caller. This slice is what calls them.

| Already on `main` | Still to write |
| --- | --- |
| `FsStore.saveRun` / `findRun` / `listRuns` / `rebuildIndex` / `resetWorkDir` | The runner that calls them |
| `domain/run/resume.ts` → `firstIncompleteStep` (pure, tested) | Wiring it to the real steps |
| `STEP_ORDER` — the five steps in order | Recording each one as it completes |

**The four pieces:**

1. **Write run state.** `saveRun` after each step completes, so `state.json`
   records how far the run got. `extract` writes none today.
2. **Resume from it.** `findRun(externalId)` → `firstIncompleteStep` → restart
   there rather than at the beginning.
3. **Close the 5c gap.** Re-extracting a video whose package directory exists
   currently fails with `WORK_DIR_EXISTS`. With the identity in `state.json`,
   "the same video again" reuses the directory while "a different video with the
   same title" still refuses. A test in `src/cli/extract.test.ts` pins the
   current refusal — it changes when this lands.
4. **Wire `--force`.** `resetWorkDir` already deletes an allowlist and never the
   directory; this slice adds the flag and the guarantee that `--force` only
   ever reaches a work dir under `dataDir`.

**Worth considering here:** `veta list` on top of `listRuns`, and a
`-{externalId}` tiebreaker for real title collisions — `slugify` drops the id
whenever a title exists, so two videos sharing a title share a directory name.

**Debts inherited from Slice 5**, each documented in its merged PR:

- `resolveWithin` never calls `realpath`, so a symlink planted inside `dataDir`
  still escapes containment. The fix belongs in the `FsStore` constructor.
- The `state.json`-before-`index.json` write order is commented and correct but
  untested; proving it needs a double, and this repo bans them.
- The `VetaErrorCode` list is hand-maintained in four places (the union,
  `EXIT_CODES`, `ALL_CODES` in its test, and `vetaErrorCodeFromString`). Only
  `EXIT_CODES` is compiler-enforced.
- No `--data-dir` / `--output-dir` flags — only `VETA_DATA_DIR` and `--lang`.

**Commit typing:** this one earns `feat`. It is the first slice since 0.4.1 that
changes what a user can do.

**Parts catalog ref:** Engram `sdd/veta-v1/tasks` → PR-8. Full handoff in Engram
under `sdd/route-b-slice-6/handoff`.

---



## Conventions that still apply

- Strict TDD, vitest, **zero doubles** (fake yt-dlp script, real temp dirs).
- Squash-merge; title is load-bearing for release-please.
- Calibration gate stays in CI (bound pinned until more videos inform it).
- Architecture tests (`src/arch/*`) must keep passing.

---



## Checklist — update when a slice merges

- [x] Slice 1 — caption track selection
- [x] Slice 2 — `ExtractionSourcePort` + yt-dlp adapter
- [x] Slice 3 — slug + exit codes + minimal `veta <url>`
- [x] Slice 4 — CLI shell (`yargs`, completion, doctor, `--lang`)
- [x] Slice 5 — `StorePort` + run/resume domain + `FsStore`
- [x] Slice 6 — pipeline runner (resume orchestration, `--force` wiring)
- [x] Prompt generation — `prompt.md` + Enter-to-copy clipboard delivery
- [x] Progress UX — typed pipeline events + hand-rolled stderr renderer
- [x] Playlist support — identify, list, orchestrate per-member extraction,
      CLI auto-detect, `list`/`purge` grouping (see Engram `sdd/playlist-support`;
      curation flags `--limit`/`--skip`/`--only`/`--skip-only` shipped too)
- [ ] Revisit prompt UX against real usage
