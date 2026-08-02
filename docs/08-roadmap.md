# 8. Roadmap — where we are

**Next action:** Slice 5 — `StorePort` + run/resume domain + `FsStore`.
Slice 4 (CLI shell with `yargs`) is implemented and awaiting merge.

This file is the living plan. Engram keeps the same picture under
`veta/roadmap`. Prefer this document when you need to reorient; Engram is
backup across sessions.

---

## Quick path

1. ~~Slice 2: port + yt-dlp adapter.~~
2. ~~Slice 3: slug, exit-code map, minimal CLI → `transcript.md`.~~
3. ~~Slice 4: CLI shell (`yargs`, completion, doctor).~~
4. **Now:** StorePort / resume / safe `--force` reset (catalog PR-6).
5. Later: pipeline runner that actually resumes mid-run (catalog PR-8).
6. Later: progress UX, config persistence, prompt delivery.

---

## Strategy in force: Route B (complete) → CLI shell → persistence

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
| 4     | CLI shell: `yargs`, completion, doctor, `--lang`        | **Done** (code complete; merge pending) — catalog PR-9                                  |
| 5     | Persist run state; resume / safe reset primitives       | **Next** (catalog PR-6)                                                                 |


**Still deferred** (after store + pipeline):

- Config persistence and doctor polish
- Progress UX (`StepEvents` → listr2 / plain)
- Prompt hydration + agent delivery
- Speaker-change paragraph breaks (`isSpeakerChange`)
- Tightening `assignChapters` vs `Chapter.endSec` (left undecided on purpose)

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


Empty shells still on disk (no real implementation yet): `src/pipeline/`,
`src/adapters/store/`, several `src/domain/{run,config,prompt}/`.
Thin extract in `src/cli/extract.ts` writes files directly with `fs` — no
`StorePort` yet. Slice 4 adds `src/cli/{cli-structure,completion,run}.ts`.

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
catalog PR-9 surface; progress UX (listr), config persistence, and prompt
delivery remain deferred.


| Piece                         | Responsibility                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `cli/cli-structure.ts`        | Shared command/flag registration; argv normalization for bare URLs             |
| `cli/completion.ts`           | `--get-yargs-completions` runner with no adapter side effects                  |
| `cli/run.ts`                  | `run()` / `main()` wiring extract + doctor through yargs                       |
| `cli/main.ts`                 | Composition root: completion short-circuit, then dynamic import of `run.ts`  |


**Out of scope for this PR (intentionally deferred):** StorePort, pipeline
`StepEvents`, listr progress UX, config persistence, prompt delivery,
`--force` resume.

**Parts catalog ref:** Engram `sdd/veta-v1/tasks` → PR-9.

---



## Slice 5 — next PR (detail)

**Outcome:** persistence primitives so a run can be recorded, found again,
resumed at the first incomplete step, and safely reset under `--force` —
without yet owning the full pipeline orchestrator.

Today `extract.ts` mkdirs + writes `transcript.md` with raw `fs`. After
this slice, the filesystem contract lives behind `StorePort` / `FsStore`.


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

**Out of scope for this PR:** pipeline `run-extraction` / `StepEvents`,
progress renderers, config persistence, prompt delivery.

**Commit typing:** likely `feat` (user-visible resume/force comes when
wired) or `chore` if this PR ships store-only with no CLI behavior change.
Prefer shipping store + a thin extract migration behind `StorePort` so the
PR earns real behavior; call that in the PR title.

**Parts catalog ref:** Engram `sdd/veta-v1/tasks` → PR-6 (T6.1–T6.6).

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
- [ ] Slice 4 — CLI shell (`yargs`, completion, doctor, `--lang`) — code complete, merge pending
- [ ] Slice 5 — `StorePort` + run/resume domain + `FsStore`
- [ ] Slice 6 — pipeline runner (resume orchestration, `--force` wiring)
- [ ] Revisit config / prompt / progress UX against real usage
