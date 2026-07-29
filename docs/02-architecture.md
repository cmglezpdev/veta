# 2. Architecture

## Four layers, one rule

Code lives in one of four layers. Which layer a file belongs to is decided by
a single question: **what does it need to know about?**

| Layer | May import from | Knows about |
|---|---|---|
| `domain/` | `domain/` only — **not even `node:*`** | The problem: cues, chapters, paragraphs |
| `ports/` | `domain/` types | The two boundaries where implementations swap |
| `pipeline/` | `domain/`, `ports/` | Orchestration: order, resume, cancellation |
| `adapters/` | anything, including packages and `node:*` | The outside world: yt-dlp, the filesystem |
| `cli/` | everything | Presentation and wiring |

Dependencies point one way: outward layers know about inward ones, never the
reverse. `adapters/` may import `domain/`; `domain/` may not import
`adapters/`.

## Why `domain/` is not allowed to know about YouTube

This is the part worth understanding, because everything else follows from
it, and because it is easy to mistake for ceremony.

`src/domain/transcript/segment.ts` decides where paragraphs break. It reads
cue timings and word counts. It has no idea YouTube exists — the words
`tStartMs`, `automatic_captions`, and `json3` do not appear in it.

That is deliberate, and the payoff is concrete. A later phase adds a second
source: local video files transcribed by speech recognition. That source
produces cues too, with completely different field names and no relation to
YouTube's format.

- If segmentation knew about `tStartMs`, adding that source would mean
  rewriting segmentation.
- Because it only knows `CaptionCue`, adding that source means writing one
  new adapter. Segmentation, joining, chapter assignment, and rendering are
  untouched.

The same argument covers the reverse direction. When YouTube changes their
payload shape — and they will — the change is contained to two files under
`src/adapters/ytdlp/`. Nothing else in the tree needs review.

**The rule is what buys that.** It only works while it has zero exceptions,
which is why `domain/` may not import even `node:*`: a domain file that reads
a file or a clock is no longer a pure function of its inputs, and the
guarantee is gone.

## The tree

```
bin/cli.js                    thin shim into the built CLI
scripts/                      developer tools, not shipped
src/
  domain/                     PURE. No I/O, no packages, no node:*
    transcript/               cue, join, chapters, segment, render, deep-link
    video/                    metadata, language, track selection, slug
    prompt/                   template, hydrate
    run/                      steps, run record, resume
    config/                   schema, roots
    time/                     staleness
    errors/                   error codes
    json.ts                   safe narrowing for untrusted payloads
  ports/                      the two swappable boundaries
  pipeline/                   orchestration, force scoping, events
  adapters/
    ytdlp/                    binary resolution, invocation, parsing, fixtures
    store/                    paths, atomic writes, filesystem store
  cli/
    main.ts                   COMPOSITION ROOT — the only file that
                              constructs adapters
    commands/, render/
tests/arch/                   import-boundary and vocabulary tests
```

### What exists today

The tree above is the plan. Built so far:

- `domain/json.ts`, `domain/transcript/{cue,join,chapters,segment}.ts`
- `adapters/ytdlp/{info-json,json3}.ts` and the captured fixtures
- `cli/main.ts` as an empty placeholder

`ports/`, `pipeline/`, `adapters/store/`, and the CLI commands are empty
directories. They are present so the intended shape is visible, not because
anything is hidden in them.

## Why `pipeline/` is a top-level layer

It could plausibly sit under `domain/`. It does not, for one reason: the
pipeline runner **must** import the port interfaces, since it takes both as
parameters, and it needs `AbortSignal` for cancellation.

Nesting it under `domain/` would force a special case into the one rule in
this codebase that is currently uniform. Rules with one exception acquire a
second. The layer stays top-level so the import rule stays absolute.

The name is `pipeline/` rather than `application/` because it says what the
thing is, not which layer it belongs to.

## Layers deliberately not added

| Not added | Why |
|---|---|
| `services/` or `utils/` | Buckets attract coupling. Every file has a named concern |
| An `application/` layer above `pipeline/` | `pipeline/` already is that layer |
| DDD vocabulary — entity, aggregate, repository | Disproportionate for a CLI |
| Ports for clipboard, terminal rendering, HTTP | One implementation each, no credible second |
| A wrapper around the yt-dlp package | We never import it — see [Development](06-development.md) |

`domain/json.ts` deserves a note, since it looks like the `utils/` bucket
that was just rejected. It is not one: it has a single stated concern —
narrowing values that came from outside the process — and it lives in
`domain/` rather than beside the parsers because config validation will need
it too, and config schemas are domain code. Putting it in `adapters/` would
have made it unreachable from there without breaking the import rule.

## Enforcement

Two tests are planned under `tests/arch/`, neither requiring a new
dependency:

1. **Boundary test** — walk every file under `src/`, extract its import
   specifiers, assert each satisfies the table above.
2. **Vocabulary containment** — assert that wire-level names (`tStartMs`,
   `dDurationMs`, `automatic_captions`, `upload_date`, `tlang`, and others)
   appear **only** under `src/adapters/ytdlp/`.

Both read source text rather than a real module graph, so both have known
blind spots: dynamic imports with computed specifiers, `require.resolve`,
re-exports through a barrel, and specifiers inside comments. Those are
accepted rather than fixed. The tests exist to catch the realistic mistake —
someone types an import of `adapters/` into a domain file, or pastes a
YouTube field name where it does not belong — and they do that for one file
walk and no dependencies.

Two conventions keep the gaps narrow: `domain/` uses no barrel files, and
dynamic `import()` is not used anywhere.

## Next

[Data sources](03-data-sources.md) — what yt-dlp actually gives us.
