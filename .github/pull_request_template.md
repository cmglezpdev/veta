<!--
Keep this short. The commits carry the detail — this is the summary a
reviewer reads first.
-->

## What this changes

<!-- One or two sentences. What can someone do after this that they could not do before? -->

## Why

<!-- The problem, not the solution. Link an issue if there is one: Closes #123 -->

## How to verify

<!--
The exact commands a reviewer should run, and what they should see.
Most changes to parsing or segmentation are checked with:

  node scripts/inspect-transcript.ts   # the numbers
  node scripts/build-transcript.ts     # the document to read

If a measured figure in docs/ changed, say so and give the old and new value.
-->

## Checklist

- [ ] `pnpm typecheck` and `pnpm test` pass
- [ ] Commits follow [Conventional Commits](https://github.com/cmglezpdev/veta/blob/main/docs/07-releasing.md)
      — a malformed message is silently dropped from the changelog, with no error
- [ ] The version bump this implies is the intended one (`feat` → minor,
      `fix` → patch, breaking → see the pre-1.0 note in the releasing doc)
- [ ] `domain/` imports nothing outside `domain/` — not even `node:*`
- [ ] YouTube wire-level names stay inside `src/adapters/ytdlp/`
- [ ] Documentation under `docs/` reflects the change, including any measured
      number that moved
- [ ] No `vi.mock`, module-level `vi.spyOn`, or `vi.useFakeTimers` was added
      — see [Testing approach](https://github.com/cmglezpdev/veta/blob/main/docs/06-development.md#testing-approach)

## Anything unresolved

<!--
Known gaps, deferred fixes, or bounds left failing on purpose. Say it here
rather than leaving a reviewer to find it. A documented open problem is fine;
an undocumented one is not.
-->
