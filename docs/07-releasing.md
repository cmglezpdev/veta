# 7. Releasing

## Conventional commits

Commit messages are not documentation here — they are **input to the release
automation**. The prefix on each commit determines the next version number
and what appears in the changelog.

```
type(scope): description
```

| Prefix | Effect |
|---|---|
| `feat:` | Minor bump, listed under **Features** |
| `fix:` | Patch bump, listed under **Bug Fixes** |
| `feat!:` or a `BREAKING CHANGE:` footer | See the pre-1.0 note below |
| `perf:`, `docs:`, `refactor:` | No bump, but shown in the changelog |
| `chore:`, `ci:`, `test:`, `build:`, `style:` | No bump, hidden from the changelog |

A commit that does not follow this format cannot be classified, and its
change silently never appears in a release note.

### The hook that catches it

That silence is the problem worth engineering against. Nothing fails when a
message is malformed — `release-please` just skips it, so the change is
missing from the changelog and nobody finds out until someone goes looking.

`.githooks/commit-msg` rejects a message the automation could not classify,
while it is still editable. It is a shell script with a regex and **no
dependency**: `husky`'s entire job is pointing `core.hooksPath` at a
versioned directory, which is one line in the `prepare` script, so it runs
on `pnpm install` with nothing to install.

Merge, revert, and `fixup!` subjects are exempt — git writes those itself.
`git commit --no-verify` bypasses the check.

> **The hook cannot see a PR title.** Merging writes a commit whose subject
> comes from the title typed into the GitHub UI — composed on the server, where
> no local hook runs. Squashing goes further and makes that title the *only*
> message the commit has.

### The title is the string that matters

`release-please` associates every commit with the pull request it came from and
reads that PR's **title**, not the merge commit's subject. The title is
therefore the load-bearing string, under any merge strategy, and it is what the
`pr-title` job in `.github/workflows/ci.yml` validates.

That job runs the title through **`.githooks/commit-msg` itself** rather than
restating its regex, so the rule has one definition and the two places it is
enforced cannot drift apart. A failing check leaves the title still editable,
which is the point of catching it there.

PR #2 is the worked example, and it is worth reading precisely, because it is
easy to draw the wrong lesson from it. Its merge commit landed on `main` as
`eat(transcript): turn captions into a readable, deep-linked document` — the
leading `f` lost while hand-editing the merge message. Its **title**, however,
was correct, so `release-please` classified the change as a feature, wrote it
into the 0.2.0 changelog, and bumped the minor version. Nothing was lost.

The malformed subject is cosmetic noise in `git log`, not a release failure. It
is left as it is: rewriting it would mean a force push over a released tag to
tidy one line of history.

### Choosing a merge strategy

Both squash and merge commits work. The trade is history granularity against
changelog granularity, and it is a per-PR choice rather than a repository-wide
one:

| | Lands on `main` | Changelog | Revert / `bisect` |
|---|---|---|---|
| Merge commit | Every commit, plus one grouping them | One entry per commit | Per work unit |
| Squash | One commit, message from the PR title | One entry per PR | Per PR only |

Squash when a PR's internal commits are process noise — review fixups,
corrections to earlier commits in the same branch — because those are entries
nobody wants in a release note. Prefer a merge commit when the commits are
split by unit of work and each one carries reasoning worth keeping attached to
its own diff.

One caveat if you merge rather than squash: `BEGIN_COMMIT_OVERRIDE`, the escape
hatch for rewriting release notes after the fact, only works on squashed PRs.

A verbose changelog is usually not a merge-strategy problem. Typing internal
construction steps as `feat` puts them in front of users who did not gain a
feature; see the note on commit types above.

## What counts as breaking

For a CLI, the public contract is the **user-facing surface**, not internal
TypeScript types.

| Change | Bump |
|---|---|
| Removing or renaming a command or flag | Major |
| Changing the config schema incompatibly | Major |
| Changing the on-disk output structure users rely on | Major |
| Changing exit codes | Major |
| Adding a command, flag, or optional config key | Minor |
| Bug fixes, better error messages, performance | Patch |

Internal refactors, dependency bumps, and type changes that do not alter the
CLI surface are **not** breaking.

## Pre-1.0 behaviour

The project starts at `0.1.0` and stays in `0.x` while the command surface
is still settling. `release-please` is configured with
`bump-minor-pre-major`, so:

| From 0.1.0 | |
|---|---|
| `fix:` | → 0.1.1 |
| `feat:` | → 0.2.0 |
| Breaking change | → **0.2.0**, not 1.0.0 |

`1.0.0` is published deliberately, once the surface is stable enough that
breaking it warrants a major bump — never as a side effect of one commit.

## The release flow

Merging to `main` does **not** publish anything. Merging and releasing are
separate, deliberate acts.

```
topic branch ──► PR ──► merge to main
                            │
                            ▼
              release-please opens or updates a Release PR
              (accumulating version bump + changelog entries)
                            │
                    you merge that PR
                            │
                            ▼
              tag v0.2.0 + GitHub Release created
                            │
                            ▼
              typecheck ──► test ──► npm publish --provenance
```

**Merging the Release PR is the act of releasing.** It accumulates pending
changes until then, so a release is something you review and choose.

`release-please` was chosen over `semantic-release`, which publishes on every
merge with no human gate, and over `changesets`, which requires authoring a
separate file per change — worthwhile in a multi-package repository,
redundant ceremony in a single-package one that already uses conventional
commits.

Configuration lives in `release-please-config.json` and
`.release-please-manifest.json`; the workflow is `.github/workflows/release.yml`.

## Publishing

Publishing uses **npm Trusted Publishing over OIDC**. There is deliberately
no `NPM_TOKEN` secret anywhere in this repository — nothing to leak, because
no publishable credential exists. npm is configured to accept publishes only
from this repository's release workflow, and the job requests
`id-token: write` for that exchange.

**Provenance attestations** cryptographically link each published artifact to
the commit and workflow that produced it.

The test suite runs inside the publish job. A failing suite blocks the
release.

## Before the first publish

Three steps are still outstanding, and the first release cannot happen
without them.

**1. Register the trusted publisher.** npm requires a package to exist before
you can configure trusted publishing in the web UI — the classic
chicken-and-egg. `npm trust` (npm 11.10.0 and later) resolves it without
publishing a placeholder first:

```sh
npm login
npm trust github @cmglezpdev/veta \
  --file release.yml --repo cmglezpdev/veta --allow-publish
```

**2. Make the repository public.** npm states plainly that provenance
generation is not supported for private repositories: the attestation lands
in a public transparency log that references the source repo. While the repo
is private, `npm publish --provenance` will fail.

**3. Enable Actions to create pull requests.** Settings → Actions → General.
Without it, `release-please` cannot open the Release PR at all.

## CI

`.github/workflows/ci.yml` runs `typecheck` and `test` on every push to
`main` and every pull request, across `ubuntu-latest` and `macos-latest` on
Node 24.

The matrix is **POSIX-only by decision**. Windows path handling — `%APPDATA%`,
reserved filename stems, case-insensitive containment, the `.exe` suffix — is
implemented, because it is cheap and correctness-relevant, but it is
**implemented, not verified**. `execFile` on a shebang script does not work
there, and the `.cmd` shim it would need cannot be exercised in this matrix.
Writing an untested shim to claim coverage we do not have would be worse than
stating the gap.

The workflow also declares no `container:`, so runners stay non-root.
Tests that assert a write failure do not fail for uid 0, and would otherwise
pass for the wrong reason.
