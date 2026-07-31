# 8. Roadmap — where we are

**Next action:** Route B slice 2 — yt-dlp subprocess adapter behind
`ExtractionSourcePort`. Until that lands, `veta <url>` still cannot run.

This file is the living plan. Engram keeps the same picture under
`veta/roadmap`. Prefer this document when you need to reorient; Engram is
backup across sessions.

---

## Quick path

1. Slice 2: port + yt-dlp adapter (binary / diagnose / invoke / source).
2. Slice 3: `slug`, exit-code map, minimal CLI that writes `transcript.md`.
3. Only then: store / resume / config / prompt delivery (deferred from Route B).

---

## Strategy in force: Route B

We abandoned following the original 12-PR checklist in order. Reality had
drifted: normalization and tests landed ahead of ports/CLI, empty folders
existed for store/pipeline/ports, and the calibration gate needed more real
videos before store/resume complexity paid off.

**Route B** = thin vertical slice toward a working `veta <url>`:


| Slice | Goal                                                    | Status                                                                                  |
| ----- | ------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1     | Choose the right caption track before fetching anything | **Done** — PR [#5](https://github.com/cmglezpdev/veta/pull/5), on `main` as of `v0.2.1` |
| 2     | Talk to yt-dlp for real (port + adapter)                | **Next**                                                                                |
| 3     | Minimal CLI: URL → package folder + `transcript.md`     | After slice 2                                                                           |


**Explicitly deferred** until after `veta <url>` works:

- Full `StorePort` / resume / `--force` blast radius
- Config persistence and doctor polish beyond what slice 2–3 need
- Prompt hydration + agent delivery
- Speaker-change paragraph breaks (`isSpeakerChange`)
- Tightening `assignChapters` vs `Chapter.endSec` (left undecided on purpose)

The original 12-PR SDD checklist still lives in Engram (`sdd/veta-v1/tasks`).
Treat it as a **parts catalog**, not the current sequence.

---



## Already on `main`


| What                                                               | Evidence                                                                                            |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Tooling, fixtures, release rails                                   | Scaffolding + `v0.2.0` / `v0.2.1`                                                                   |
| Transcript pipeline (cue → join → chapters → segment → render)     | PR [#2](https://github.com/cmglezpdev/veta/pull/2)                                                  |
| Test net (~80→120), calibration gate in CI, arch + PR-title guards | PR [#3](https://github.com/cmglezpdev/veta/pull/3), [#5](https://github.com/cmglezpdev/veta/pull/5) |
| Docs: squash vs merge-commit and release-please title reading      | PR [#4](https://github.com/cmglezpdev/veta/pull/4)                                                  |
| Caption track selection + `VetaError`                              | PR [#5](https://github.com/cmglezpdev/veta/pull/5)                                                  |


Empty shells still on disk (no real implementation yet): `src/ports/`,
`src/pipeline/`, `src/adapters/store/`, several `src/domain/{run,config,prompt}/`,
`src/cli/{commands,render}/`.

---



## Slice 2 — next PR (detail)

**Outcome:** something in-process can resolve a yt-dlp binary, invoke it,
classify failures, and implement `ExtractionSourcePort` — tested with a real
fake executable on `VETA_YTDLP_PATH` (zero `vi.mock`).


| Piece                                       | Responsibility                                    |
| ------------------------------------------- | ------------------------------------------------- |
| `ports/extraction-source.ts`                | Port interface (domain types only)                |
| `adapters/ytdlp/binary.ts`                  | PATH-then-bundled resolution; config/env override |
| `adapters/ytdlp/diagnose.ts`                | Map exit code + stderr → `VetaError` (pure)       |
| `adapters/ytdlp/invoke.ts`                  | Spawn with `--ignore-config`; wire diagnose       |
| `adapters/ytdlp/ytdlp-extraction-source.ts` | Port implementation                               |


**Out of scope for this PR:** CLI UX, writing `transcript.md` end-to-end,
store/resume. Those are slice 3+.

**Commit typing:** prefer `chore` / focused scopes until `veta <url>` works
for a user — then that PR earns `feat`. Squash-merge is the default; the
**PR title** is the changelog line.

---



## Slice 3 — after that


| Piece                  | Responsibility                                 |
| ---------------------- | ---------------------------------------------- |
| `domain/video/slug.ts` | Safe per-video directory name                  |
| `cli/exit-codes.ts`    | Map every `VetaError.code` → exit status       |
| CLI extract path       | URL in → work dir + `transcript.md` out (thin) |


Success looks like: from a clean checkout, `veta <youtube-url>` produces a
readable transcript using the track selector from slice 1 and the adapter
from slice 2.

---



## Conventions that still apply

- Strict TDD, vitest, **zero doubles** (fake yt-dlp script, real temp dirs).
- Squash-merge; title is load-bearing for release-please.
- Calibration gate stays in CI (bound pinned until more videos inform it).
- Architecture tests (`src/arch/*`) must keep passing.

---



## Checklist — update when a slice merges

- [x] Slice 1 — caption track selection
- [ ] Slice 2 — `ExtractionSourcePort` + yt-dlp adapter
- [ ] Slice 3 — slug + exit codes + minimal `veta <url>`
- [ ] Revisit deferred store/resume/prompt work against real usage