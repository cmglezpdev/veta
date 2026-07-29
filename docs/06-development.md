# 6. Development

## Prerequisites

- **Node 24** or newer. The project relies on Node running TypeScript
  directly, which is why the floor is this high.
- **pnpm 11.17.0**, pinned by the `packageManager` field. Corepack downloads
  and activates it automatically — no manual install needed.

```sh
pnpm install
```

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

veta shells out to a `yt-dlp` binary. Three sources are tried in order:

1. An explicit path from config or the `VETA_YTDLP_PATH` environment variable
2. `yt-dlp` on `PATH`
3. A copy bundled by the `youtube-dl-exec` dependency

### The pnpm complication

`youtube-dl-exec` downloads the binary in a postinstall script. **pnpm 10 and
later skip dependency build scripts by default**, so a plain `pnpm add`
leaves no binary at all — not a stale one, none.

For this repository the approval lives in `pnpm-workspace.yaml`:

```yaml
allowBuilds:
  youtube-dl-exec: true
```

> The original design specified `pnpm.onlyBuiltDependencies` in
> `package.json`. **pnpm 11 no longer reads that key** and warns that it is
> ignored; the setting moved to `pnpm-workspace.yaml`.

This fixes local development and CI. It does **not** propagate to a user
running `pnpm add -g @cmglezpdev/veta`, and there is no package-side fix for
that. The recommended install story is therefore to install yt-dlp
independently — `brew install yt-dlp` or `pipx install yt-dlp` — which also
keeps it current. The bundled copy is a fallback, not the primary path.

### The package is never imported

`youtube-dl-exec` appears in `dependencies` **solely so its postinstall
runs**. No TypeScript file imports it. The bundled binary's path is computed
from the package's own location instead:

```ts
const pkgJson = require.resolve("youtube-dl-exec/package.json");
```

The reason is concrete: the package's `constants` export exists at runtime
but is absent from its type definitions, so importing it fails
`tsc --noEmit`. Declaring the missing type would convert a compile error into
a runtime one. Computing the path needs no types from the package at all, and
its failure mode — the file is not there — is one we already have to handle.

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

## Next

[Releasing](07-releasing.md) — commits, versions, publishing.
