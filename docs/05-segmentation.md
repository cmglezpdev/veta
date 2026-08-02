# 5. Segmentation

Deciding where paragraphs break. This is the hardest problem in the codebase,
and the one most able to fail without anyone noticing.

## Why it is hard

Paragraphs do not exist in the source. Nothing in a subtitle file marks them.
They have to be inferred, and the two obvious signals are both weak.

**Sentence marks are buried, not absent.** Only **176 of 2,580 cues** — 6.8% —
end in a sentence mark, so a naive test of "does the cue end in `.?!`" finds
almost nothing to break on. But the marks are there: YouTube's ASR embeds most
of them mid-cue, attaching the start of the next sentence to the same cue
(*"the market. Next"*). Splitting those cues at their last real sentence end
turns sentence boundaries into cue boundaries, and the sparse 6.8% becomes a
rich signal.

**Word counts are arbitrary.** Breaking every N words guarantees breaks land
mid-sentence, because nothing about the Nth word makes it a good place to
stop.

Pauses are therefore the **fallback**, not the primary signal — graded against
the measured gap distribution, which is why the [`endMs` decision](04-normalization.md#the-endms-decision)
had to come first. With cue ends taken as last-word onsets, the gap
distribution across 2,579 boundaries is:

| Statistic | Value | | Threshold | Boundaries at or above |
|---|---|---|---|---|
| min | 0 ms | | ≥ 700 ms | 117 |
| median | 240 ms | | ≥ 1000 ms | **39** |
| p90 | 480 ms | | ≥ 1500 ms | 14 |
| p99 | 1120 ms | | ≥ 2000 ms | 3 |
| max | 2770 ms | | | |

**Zero negative gaps.** In 81 minutes of continuous speech, the speaker
paused a full second only 39 times. That rarity is what makes a one-second
pause meaningful.

## The constants

Each is tied to a measured percentile rather than to a round number.

```ts
export const PARAGRAPH_MIN_WORDS    = 40;    // below this, never break on a pause
export const PARAGRAPH_TARGET_WORDS = 80;    // above this, a modest pause suffices
export const PARAGRAPH_MAX_WORDS    = 200;   // safety net
export const PAUSE_STRONG_MS = 1000;         // ~p99 — unmistakable (39 sites)
export const PAUSE_SOFT_MS   = 500;          // ~p90 — perceptible (~258 sites)
```

> These are inter-**onset** intervals, not silences. Because a cue's end is
> its last word's onset, a 500 ms gap is roughly 200–250 ms of actual
> silence. Hence `PAUSE_*` rather than `SILENCE_*`.

## The rules

Before any boundary is evaluated, each cue is **split at its last real
sentence end** — a mark followed, after any closing quotes, by the end of the
cue or the start of a new sentence. Requiring that gap is what keeps decimals
("3.5") and abbreviations ("i.e.") from counting as sentence ends. The head
ends the sentence; the tail begins the next one. This is what makes rule 3
find boundaries the captions never put at a cue boundary.

Evaluated at every boundary between two cues. **First match wins**, and the
order is a quality ranking — an earlier rule is a better place to break.

| # | Reason | Fires when |
|---|---|---|
| 1 | `chapter` | The chapter changed. Unconditional |
| 2 | `strong-pause` | ≥ 40 words **and** gap ≥ 1000 ms |
| 3 | `sentence` | ≥ 80 words **and** the cue ends in `.?!` |
| 4 | `soft-pause` | ≥ 80 words **and** gap ≥ 500 ms |
| 5 | `cap` | ≥ 200 words — the safety net |

Rule 5 is the one you do not want firing often. It breaks because it must,
not because a good place was found.

## Lookahead rescue

Rules 2, 4 and 5 can fire mid-sentence — nothing guarantees a pause or the
word cap coincides with a sentence end. When one of them fires, the break is
moved forward to the next sentence end within `PARAGRAPH_LOOKAHEAD_WORDS`
(20 words of carried text), never across a chapter. Only if no sentence end
is close enough does the break land where the pause did.

## Retro-split

When the cap fires with no sentence end within the lookahead budget, splitting
at the current boundary is exactly what produces paragraphs that end
mid-sentence — the word counter tripped there for no reason related to the
content.

Instead, the segmenter tracks the **largest gap seen since the target length
was crossed** and splits *there*, emitting the paragraph up to that point and
carrying the remainder forward. It converts the worst available break into
the best one in that window, in a handful of lines.

## Results against real data

214 paragraphs from 2,580 cues:

```
words: min 3 | median 87 | p90 109 | max 148

why each paragraph ended
  sentence        155   72.4%
  strong-pause     22   10.3%
  soft-pause       16    7.5%
  chapter          20    9.3%
  cap               0    0.0%
```

`chapter 20` is exactly right — 21 chapters have 20 boundaries between them.
The word cap no longer fires at all: every paragraph is closed by a sentence
end, a pause, or a chapter. The residual mid-sentence endings are almost all
chapter-forced — a paragraph is never allowed to straddle a chapter (rule 1),
and YouTube's chapter markers do not respect sentence ends.

## The calibration gate

Paragraph quality is the kind of thing a human reviewer will approve without
checking. You can read the rendered markdown, see reasonable-looking
paragraphs, and never notice that most breaks came from the emergency rule —
it looks almost identical.

An earlier revision of the design shipped exactly that failure: a rule was
derived analytically, fired **zero** times against real data, and the word
cap silently did 56% of the work. It was caught by measuring, not by reading.

So the bounds are asserted mechanically, in CI, against the full 81-minute
payload — `src/domain/transcript/segment.calibration.test.ts`:

| Assertion | Bound | Current | |
|---|---|---|---|
| Non-chapter paragraphs ending mid-sentence | < 15% | 7.0% | PASS |
| `cap` breaks as a share of all breaks | < 15% | 0.0% | PASS |
| Median paragraph length | 60–160 words | 87 | PASS |
| Max paragraph length | bounded | 148 | PASS |
| Paragraphs spanning two chapters | 0 | 0 | PASS |

`node scripts/inspect-transcript.ts` prints the distributions those
assertions are drawn from — the percentile tables and the break histogram the
bounds were chosen against. The script explores; the test enforces.

## The pause-share pin, and why it is gone

An earlier revision pinned a metric that no longer applies. It asserted that
`strong-pause` + `soft-pause` must account for close to half of all
non-chapter breaks, and treated `sentence` dominating at 38.7% as a symptom
of a missing speaker signal. The bound was pinned with a "known failure"
record and a deferred fix: a speaker-change signal.

That pin is gone because the design changed. Sentence ends are no longer a
stray 6.8% of cues — they are the primary signal, surfaced by splitting the
cues that carry them mid-text. The pause share of non-chapter breaks is now
~20% by construction, and forcing it back above 45% would mean crippling the
sentence rule. The regression guard is now the thing the design exists to
guarantee: a paragraph should not end mid-sentence.

The observation that started the pin is still true and still open: the
reference video is an interview, and 94 speaker changes are marked in its
captions but invisible to the segmenter. A speaker turn is a better paragraph
boundary than a sentence end, so `isSpeakerChange` remains future work — still
deferred for the same reason as before: it would extend the `CaptionCue`
contract from a sample of one video. When it is built, the signal to use is
[`isSpeakerChange`](03-data-sources.md#speaker-changes), not the `>>` text.

## Next

[Development](06-development.md) — running all of this.
