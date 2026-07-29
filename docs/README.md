# veta documentation

How the system works, why it works that way, and what was measured rather
than assumed.

`PRD.md` at the repository root is the product specification — what veta is
for and what it must do. These documents are the counterpart: how it is
actually built.

## Reading order

The documents build on each other. If you are new, read them in order — the
first two are enough to understand any part of the codebase.

| | | |
|---|---|---|
| 1 | [Concepts](01-concepts.md) | The problem, and the five words you need before reading any code |
| 2 | [Architecture](02-architecture.md) | Four layers, one import rule, and the reason it exists |
| 3 | [Data sources](03-data-sources.md) | What yt-dlp hands us, and why it takes two files |
| 4 | [Normalization](04-normalization.md) | Turning 2,580 caption fragments into continuous text |
| 5 | [Segmentation](05-segmentation.md) | Deciding where paragraphs break, from measured pauses |
| 6 | [Development](06-development.md) | Running it, and why the toolchain looks like this |
| 7 | [Releasing](07-releasing.md) | Conventional commits, version bumps, publishing |

## Where else to look

- **`PRD.md`** — product scope, requirements, non-goals.
- **`src/adapters/ytdlp/__fixtures__/FIXTURES.md`** — provenance of the
  captured test payloads: which video, which yt-dlp version, what was
  trimmed, and three places where the design did not survive contact with
  real data.

## A convention worth knowing

Numbers in these documents are measured against a real payload, not
estimated. Where a figure appears — 2,580 cues, 39 pauses over a second,
17.9x size reduction — it came from running the code against the committed
fixtures, and you can reproduce it:

```sh
node scripts/inspect-transcript.ts   # the numbers
node scripts/build-transcript.ts     # the document itself
```

Where something is a decision rather than a measurement, it says so, and
gives the alternative that was rejected.
