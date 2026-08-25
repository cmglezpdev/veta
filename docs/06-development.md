# 6. Development

## Prerequisites

- **Node 24** or newer. The project relies on Node running TypeScript
  directly, which is why the floor is this high.
- **pnpm 11.17.0**, pinned by the `packageManager` field. Corepack downloads
  and activates it automatically — no manual install needed.

```sh
pnpm install
```

This also activates the git hooks in `.githooks/`, via the `prepare` script.
One of them rejects commit messages the release automation cannot classify —
see [Releasing](07-releasing.md#the-hook-that-catches-it).

## Commands

| | |
|---|---|
| `pnpm typecheck` | `tsc --noEmit`. A mandatory gate on its own — see below |
| `pnpm test` | Builds, then runs Vitest |
| `pnpm build` | Compiles `src/` to `dist/`, excluding tests |
| `node scripts/inspect-transcript.ts` | Runs the normalization chain against the fixtures and reports what it produced |
| `node scripts/build-transcript.ts` | Renders the same chain to markdown, at `out/transcript.md` |

Neither script needs the network, yt-dlp, or a build step. Between them they
are the fastest way to see the effect of a change to parsing or segmentation:
the first reports the numbers, the second produces the document to read.

They answer different questions, and both are needed. Statistics cannot tell
you that paragraphs read badly, and reading cannot tell you that the emergency
rule quietly made most of the breaks. The speaker-change gap described in
[Segmentation](05-segmentation.md#the-open-failure) was invisible to every
metric and obvious within a page of prose.

`out/` is git-ignored.

### Why `typecheck` is separate from `test`

Both Node's type stripping and Vitest's transform **erase types without
checking them**. A file with a genuine type error runs fine under both.

`tsc --noEmit` is therefore not redundant with the test suite; it is the only
thing verifying types at all, and it runs as its own CI step.

## Toolchain decisions

### TypeScript 7

The compiler rewritten in Go. Much faster, and recent enough that behaviour
should be verified against this version rather than assumed from older
documentation.

### Running TypeScript without a build step

`tsconfig.json` sets `rewriteRelativeImportExtensions: true`, which is what
makes imports inside `src/` look like this:

```ts
import { isRecord } from "../../domain/json.ts";
```

An explicit `.ts` extension lets Node execute the file directly. On build,
TypeScript rewrites the extension to `.js`, so the published package is
ordinary ESM.

Without this, the options were compiling before every run, or adding a
runtime loader as a dependency. Neither is worth it at this stage, where the
point is to iterate and look at output.

> A subtlety worth knowing: for a while it appeared that Node could run the
> code with plain `.js` specifiers. That was accidental — every cross-file
> import happened to be `import type`, which type stripping erases before
> resolution ever runs. The first real value import failed immediately.

### Two tsconfig files

| File | Used by | Difference |
|---|---|---|
| `tsconfig.json` | `typecheck` | Includes test files |
| `tsconfig.build.json` | `build` | Excludes `**/*.test.ts` |

Without the split, `tsc` compiled test files into `dist/`, Vitest then found
and ran both the source and compiled copies, and the published package would
have shipped tests.

### Vitest

Chosen over Jest, whose ESM support still needs experimental flags and Babel
transforms in an ESM plus TypeScript project — its weakest combination.
Node's built-in `node:test` was also capable, but Vitest is what outside
contributors already know, and this is open source.

Being a devDependency, it never ships to users.

### `packageManager`, not `devEngines`

The project originally declared `devEngines.packageManager: pnpm`. That field
makes **npm refuse to run in the project at all** — `npm pack` fails with
`EBADDEVENGINES` because npm is not pnpm — which would have broken
`npm publish` in the release workflow.

The canonical `packageManager` field pins the same version, is what
`pnpm/action-setup` reads in CI, and does not block npm.

### `scripts/` is outside the typecheck scope

`tsconfig.json` includes only `src/**/*.ts`, so files under `scripts/` are
not type-checked. They run because Node ignores types. This is a known gap,
left open pending a decision about whether developer scripts are part of the
build.

## The yt-dlp binary

veta shells out to a `yt-dlp` binary that it never ships. Two sources are
tried in order:

1. An explicit path from `VETA_YTDLP_PATH` (or an `explicitPath` passed to
   `resolveYtDlpBinary`)
2. `yt-dlp` on `PATH`

If neither resolves, `YTDLP_NOT_FOUND` names the two installs that work —
`brew install yt-dlp`, `pipx install yt-dlp` — and the environment variable.
The resolution result is cached for the process on first success.

### Why the binary is not bundled

Until 0.10.0 veta declared `youtube-dl-exec` as a dependency it never
imported, purely so that package's `postinstall` would drop a `yt-dlp` copy
that `binary.ts` used as a third source. That was removed, and the reasons
are worth keeping:

- **Unpinned and unverified.** The script fetched whatever
  `releases/latest` served on install day, with no version pin and no
  checksum. Every user ran a different, unauditable binary.
- **Install-time network dependency.** `npm install -g @cmglezpdev/veta`
  failed outright when the GitHub API was unreachable or rate-limited. Both
  CI workflows had to set `YOUTUBE_DL_SKIP_DOWNLOAD` to survive the
  60-requests-per-hour anonymous limit on shared runner egress.
- **Python, twice.** Its `preinstall` refused to install without Python
  >= 3.9, and the asset it dropped was a Python zipapp, so the bundled copy
  needed a Python interpreter at run time too.
- **Weight.** Around 40 of veta's roughly 55 production packages existed to
  support that postinstall.
- **Install scripts are on their way out.** npm now warns that the package
  has `install scripts not yet covered by allowScripts`, and a package
  cannot approve scripts on a consumer's behalf — only the installing
  project's own `package.json` counts. The warning was going to reach every
  user of veta, and eventually become a block.

The install story is therefore the one the README already led with: install
yt-dlp yourself, which also keeps it current — and staying current matters,
because yt-dlp breaks and gets fixed on YouTube's schedule, not veta's.

## Test fixtures

Parsing is tested against real captured payloads rather than hand-written
JSON, on the grounds that hand-written fixtures test your idea of a format
and captured ones test the format.

They live in `src/adapters/ytdlp/__fixtures__/`, documented by `FIXTURES.md`
in that directory. Do not hand-edit them.

## Testing approach

The commitment is that `vi.mock`, module-level `vi.spyOn`, and
`vi.useFakeTimers` appear **nowhere** in the repository. The reasoning: in a
codebase with proper dependency inversion, application code depends on
interfaces, so tests inject hand-written fakes. Module mocking is the patch
for hard-coded imports — that is, for code that *lacks* clean architecture.
Needing it signals a coupling defect rather than a testing gap.

The excuses for reaching for it are removed structurally:

| Seam | Instead of mocking | Real mechanism |
|---|---|---|
| Subprocess | `vi.mock("node:child_process")` | Point `VETA_YTDLP_PATH` at a real script that prints canned output |
| Filesystem | `vi.mock("node:fs")` | Point `VETA_DATA_DIR` at `fs.mkdtemp()` |
| Clock | `vi.useFakeTimers()` | Pass `now` as a parameter, or inject a `Clock` |

Those environment overrides exist *because* of this, not merely alongside it.

### Tests that check the codebase itself

Two suites under `src/arch/` assert structure rather than behaviour, and they
re-run on every change:

| Suite | Asserts |
|---|---|
| `boundary.test.ts` | No file imports from a layer it may not reach |
| `vocabulary.test.ts` | yt-dlp's field names appear only under `src/adapters/ytdlp/` |

Both exist because the rules they enforce already failed once under human
review. `domain/transcript/chapters.ts` imported a type from
`adapters/ytdlp/info-json.ts` — the domain reaching into an adapter — and it
passed, because `import type` erases at runtime: nothing broke, so nothing
flagged it. A convention that is only checked by remembering to check it is
the one that quietly stops holding.

The boundary suite covers the shipped graph only; `*.test.ts` files are
excluded, since the calibration test legitimately drives the whole chain from
adapter to domain end to end.

### Proving a test bites

A test written after the code it covers can pass without asserting anything
real. Before trusting a new one, break the code deliberately and confirm the
test fails — then revert. It is worth doing once per assertion that matters.

Reintroducing `dDurationMs` as a cue's end, for instance, fails the full
payload check with 2,578 clamps: the drift alarm doing exactly what it is
there for.

## Next

[Releasing](07-releasing.md) — commits, versions, publishing.
