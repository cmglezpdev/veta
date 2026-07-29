# 1. Concepts

## The problem

YouTube does not hand out transcripts. It hands out **subtitles**, and those
are a different thing: text cut into two-second fragments, each stamped with
the moment it should appear on screen.

For the reference video used throughout these documents — an 81-minute
interview — that means **2,580 fragments in a 1.9 MB JSON file**. Most of
those bytes are timing and display metadata. The words themselves are a small
fraction, and they arrive shredded: sentences split across fragments,
paragraphs nonexistent, no spaces where the cuts happened.

That file is useless to a reader, and nearly as useless to a language model.
It does not fit comfortably in a context window, and 95% of what does fit is
structure the model cannot use.

## What veta produces

A markdown document — the same content, made readable:

```
95 KB of markdown, from 1.9 MB of JSON. A 20x reduction.
```

With the video's chapters as headings, the text cut into real paragraphs, and
each paragraph carrying a link back to the exact second of video it came
from. That document is what gets handed to an AI agent, which turns it into
organized notes.

Everything in this codebase exists to perform that conversion faithfully.

## Vocabulary

Five words appear constantly. They are worth pinning down, because two of
them mean something narrower here than they do in ordinary use.

### Cue

**One subtitle line.** The unit YouTube actually ships.

A cue has three properties: when it starts, when it ends, and its text. In
code it is `CaptionCue`, defined in `src/domain/transcript/cue.ts`.

This type is the system's common language. Today cues come from YouTube
captions; a later phase will produce them from speech recognition on local
video files. Everything downstream of the parser works on cues and knows
nothing about where they came from.

> **`endMs` means something specific.** It is the moment the cue's **last
> word begins** — not the moment the subtitle disappears from the screen.
>
> Those are very different. Subtitles overlap deliberately: one stays visible
> while the next is already being spoken, so the reader has time. Using the
> disappearance time as a cue's end makes consecutive cues overlap, which
> makes every measured pause negative, which silently destroys everything
> built on top. See [Normalization](04-normalization.md#the-endms-decision).

### Chapter

**A section the video's author marked**, with a title and a time range.

The reference video has 21: *Intro*, *Dax's path into tech*, and so on
through *Book recommendation*. They come from the metadata file, not from
the subtitles — the subtitle file has no idea chapters exist.

Chapters become the headings of the output document.

### Paragraph

**A group of consecutive cues that read as one unit of thought.**

Paragraphs do not exist in the source. Nothing in the subtitle file marks
them. They are inferred, mostly from how long the speaker paused, and
producing good ones is the hardest problem in the codebase — see
[Segmentation](05-segmentation.md).

The reference video yields 164 paragraphs from 2,580 cues.

### Gap

**The silence between one cue ending and the next beginning**, in
milliseconds.

This is the single most important measurement in the system, because a pause
in speech is where a paragraph should end. When someone stops talking for a
full second, they finished a thought.

Measured across the reference video's 2,579 boundaries:

| | |
|---|---|
| Median gap | 240 ms |
| 90th percentile | 480 ms |
| Gaps of a full second or more | **39** |
| Gaps of two seconds or more | **3** |

Only 39 real pauses in 81 minutes of speech. That rarity is exactly what
makes them meaningful, and it is why the segmentation thresholds are set
where they are rather than at round numbers.

> Gaps are measured between word *onsets*, not between sounds. A 500 ms gap
> is roughly 200–250 ms of actual silence. This is why the constants are
> named `PAUSE_*` and not `SILENCE_*`.

### Track

**One language's subtitles for a video.**

The reference video offers 157 of them. Only two are real: an
auto-transcribed English track and its duplicate. The other 155 are machine
translations *of that transcription* — translating an already-imperfect
transcript, so quality degrades twice. Picking one by accident is a failure
mode the system is specifically built to avoid. See
[Data sources](03-data-sources.md#tracks-and-translations).

## Next

[Architecture](02-architecture.md) — where each piece of this lives, and the
one rule that decides.
