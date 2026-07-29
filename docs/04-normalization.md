# 4. Normalization

Turning 2,580 timed fragments into continuous, readable text. Every function
in this chapter is pure: same input, same output, no clock, no filesystem, no
network.

## The stages

```
info.json ──► parseInfoJson ──► title + 21 chapters ─┐
                                                      ├─► assignChapters ──► segmentParagraphs ──► render
json3 ─────► parseJson3 ─────► 2,580 cues ───────────┘
                                    │
                                 joinCues
                        (used when building paragraph text)
```

Two of these stages are where the subtlety lives: `parseJson3`, because of
how a cue's end is computed, and `segmentParagraphs`, which has a
[chapter of its own](05-segmentation.md).

## `parseJson3`

`src/adapters/ytdlp/json3.ts`. Raw payload in, `CaptionDocument` out.

1. **Drop non-content events.** No `segs`, or text that trims to empty. This
   removes exactly 2,580 spacer events — half the payload.
2. **Concatenate segments verbatim.** Segments carry their own leading
   spaces; joining with a space would double every one.
3. **Compute timing.** `startMs` is the event's start. `endMs` is the start
   plus the offset of the last segment containing a non-whitespace character.
4. **Collapse internal whitespace** and trim.
5. **Enforce monotonicity, and count corrections.**

### The `endMs` decision

This is the single most consequential line in the parser, and getting it
wrong is a defect that hides rather than crashes.

Each event carries `dDurationMs` — how long the subtitle stays on screen. It
is present on 100% of content events and it is the obvious choice.

**It is the wrong one.** Subtitles overlap deliberately: one remains visible
while the next is already being spoken, so the reader has time to finish
reading. Deriving a cue's end from its display window therefore makes
consecutive cues overlap.

The consequence is not a crash. It is that every gap between cues comes out
**negative**, so every pause-based rule downstream silently evaluates to
false, and paragraph segmentation quietly falls back to breaking on a word
count. The output still looks plausible. Nothing fails.

So a cue's end is instead **the onset of its last word**:

```
endMs = tStartMs + (tOffsetMs of the last segment with non-whitespace text)
```

`dDurationMs` is declared in the wire type with a comment explaining why it
is never read, so that a future reader who reaches for it finds the reason
before the bug.

### The clamp counter

After building the array, each cue's end is clamped to at most the next
cue's start, and to at least its own start — and **every clamp is counted**.

The clamp guarantees that nothing downstream ever sees a non-monotonic
stream, even from a malformed payload. The counter is a drift alarm: on real
data it must be **zero**. A non-zero count means YouTube's timing model
changed and the parser is compensating blindly.

It is currently 0 across all 2,580 cues.

## `joinCues`

`src/domain/transcript/join.ts`. Concatenates consecutive cue texts.

Cues are cut on timing, not on grammar. A sentence routinely spans two of
them, and **neither carries the space between**. In the reference payload,
zero of 2,580 cue texts end in whitespace.

So:

- Concatenating raw produces glued words.
- Always inserting a space produces stranded punctuation — a space before
  every comma.

The rule inserts a single space unless the left side ends in whitespace or
an opening bracket, or the right side begins with punctuation that attaches
leftward (`,.;:!?%)]}`).

### Why this matters more than it looks

Without this rule, **2,578 word pairs fuse into single non-words** — one at
nearly every cue boundary in the video.

This is measurable, and it resolved a discrepancy in the original design.
That design recorded 16,023 words for this video; the correct count is
18,601. The difference is exactly 2,578 — the design's word count had been
taken on text that still had the joining defect.

The cost is not cosmetic. The entire product hands this text to a language
model. A fused non-word is not a word the model knows: it tokenizes badly,
consumes *more* tokens than the two real words would have, and degrades
comprehension. You pay more and get worse results, for a missing space.

The function lives in `domain/`, not in the yt-dlp adapter, because it is a
property of segmented speech rather than of one wire format. A speech
recognition source will need the identical fix.

## `assignChapters`

`src/domain/transcript/chapters.ts`. Tags each cue with the chapter it falls
in, matched on the cue's start time.

Ranges are half-open: a cue starting exactly at a chapter's start belongs to
that chapter, not the previous one. Cues before the first chapter get
`chapterIndex: null`. A video with no chapters yields all `null`, which is a
supported case rather than an error.

### Why this runs before segmentation, not after

Segmentation forces a paragraph break wherever the chapter changes — and it
**cannot force a break at a boundary it has not been told about**.

An earlier version of the design ran segmentation first while simultaneously
claiming that no paragraph could straddle two chapters. Those two statements
are incompatible. Chapters are assigned to cues first, and the segmenter
consumes chapter-tagged cues, which makes the guarantee structural rather
than aspirational.

The consequence: a paragraph belongs to the chapter of its first cue, and
cannot span two. Verified at 0 straddling paragraphs.

## `renderTranscript`

`src/domain/transcript/render.ts`. The last stage: paragraphs in, one
markdown string out. It writes nothing and reads no clock — the caller
decides where the bytes go.

Markdown is the target because the document has two readers with the same
needs. A person wants headings to skim and timestamps to jump from; a
language model reads headings as structure and spends no tokens stripping
markup. Anything richer would serve one at the other's expense.

Each paragraph opens with its start time, linked to that moment in the video:

```markdown
## 4. Getting involved with open source

[`13:16`](https://www.youtube.com/watch?v=1VqKUrxR2C8&t=796) And then how did
you transition into open source? …
```

Three details are deliberate:

- **Headings come from the paragraphs, not from the chapter list.** A chapter
  with no speech in it produces no heading rather than an empty section.
- **`t=` is truncated, not rounded**, because YouTube seeks to the start of
  the second — truncating lands just before the first word instead of just
  after it.
- **The link is built by string concatenation, not `URL`.** The canonical URL
  arrives from outside the process and may not parse. A slightly wrong link is
  recoverable; an exception halfway through rendering is not. With no URL at
  all the timestamp degrades to plain text.

Against the reference video: 1,904 KB of json3 becomes 106 KB of markdown,
**17.9x smaller**, and that is before a single token is spent on reasoning.

## Verifying any of this

```sh
node scripts/inspect-transcript.ts
```

Runs the whole chain against the committed fixtures — no network, no yt-dlp
— and prints what each stage produced. The four numbers that must hold:

| | Meaning |
|---|---|
| `clamped 0` | The timing computation needed no corrections |
| `monotonic true` | Cues are ordered and non-overlapping |
| `negative 0` | No gap came out negative — the `endMs` decision is working |
| `before first chapter 0` | Every cue landed in a chapter |

## Next

[Segmentation](05-segmentation.md) — where paragraphs break, and why.
