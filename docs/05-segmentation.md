# 5. Segmentation

Deciding where paragraphs break. This is the hardest problem in the codebase,
and the one most able to fail without anyone noticing.

## Why it is hard

Paragraphs do not exist in the source. Nothing in a subtitle file marks them.
They have to be inferred, and the two obvious signals are both weak.

**Punctuation is too sparse.** Auto-generated captions punctuate
unreliably: only **176 of 2,580 cues** — 6.8% — end in a sentence mark.
Breaking only on sentences would produce a handful of enormous paragraphs.

**Word counts are arbitrary.** Breaking every N words guarantees breaks land
mid-sentence, because nothing about the Nth word makes it a good place to
stop.

What does work is **pauses**, but only once they are measured against the
right quantity — which is why the [`endMs` decision](04-normalization.md#the-endms-decision)
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

## Retro-split

When the cap fires, splitting at the current boundary is exactly what
produces paragraphs that end mid-sentence — the word counter tripped there
for no reason related to the content.

Instead, the segmenter tracks the **largest gap seen since the target length
was crossed** and splits *there*, emitting the paragraph up to that point and
carrying the remainder forward. It converts the worst available break into
the best one in that window, in a handful of lines.

## Results against real data

164 paragraphs from 2,580 cues:

```
words: min 8 | median 106 | p90 171 | max 205

why each paragraph ended
  sentence        63   38.7%
  soft-pause      45   27.6%
  strong-pause    23   14.1%
  chapter         20   12.3%
  cap             12    7.4%
```

`chapter 20` is exactly right — 21 chapters have 20 boundaries between them.
`cap 12` means 92.6% of breaks were made at a chosen place rather than under
duress.

## The calibration gate

Paragraph quality is the kind of thing a human reviewer will approve without
checking. You can read the rendered markdown, see reasonable-looking
paragraphs, and never notice that most breaks came from the emergency rule —
it looks almost identical.

An earlier revision of the design shipped exactly that failure: a rule was
derived analytically, fired **zero** times against real data, and the word
cap silently did 56% of the work. It was caught by measuring, not by reading.

So the bounds are asserted mechanically:

| Assertion | Bound | Current | |
|---|---|---|---|
| `cap` breaks as a share of all breaks | < 15% | 7.4% | PASS |
| Median paragraph length | 60–160 words | 106 | PASS |
| Max paragraph length | bounded | 205 | PASS |
| Paragraphs spanning two chapters | 0 | 0 | PASS |
| `strong-pause` + `soft-pause` share of non-chapter breaks | > 50% | 47.6% | **FAIL** |

Reproduce with `node scripts/inspect-transcript.ts`.

## The open failure

The last bound fails, and it is a genuine open question rather than a bug.

The design predicted this break mix: soft-pause 70–85, strong-pause 25–35,
sentence 10–15. What happened: soft-pause 45, strong-pause 23, **sentence
63**.

The cause is the rule order. `sentence` is evaluated before `soft-pause`, so
whenever both could fire, `sentence` wins. The prediction assumed `sentence`
would rarely fire, reasoning from the fact that only 6.8% of cues end in
punctuation. But once a paragraph passes 80 words it keeps accumulating until
*something* breaks it, and with 176 sentence-final cues distributed through
the video, the chance of reaching one before a 500 ms gap turned out higher
than estimated.

**Why this may not be a defect.** The bound's stated purpose is to assert
that the pause rules are doing real work — the anti-regression guard for the
failure described above, where a rule fired zero times. Here the pause rules
fire 68 times, nearly half of all non-chapter breaks. That is not dead code.

And `sentence` breaks are arguably *better* breaks: the design's own rule
ordering places `sentence` above `soft-pause`. The segmenter is being
penalized for preferring the higher-quality break.

**Why it might still be one.** "The test fails, so loosen the test" is
precisely how defects ship. The honest position is that this has not been
resolved by reading actual output yet, and until it has, the bound stays
failing rather than being quietly adjusted.

The options on the table:

1. **Relax to > 40%** and restate the assertion as "the pause rules are not
   dead code", which is what it was always meant to guarantee.
2. **Lower `PAUSE_SOFT_MS`** so pauses fire before reaching a sentence end.
   This tunes constants to satisfy a metric rather than to improve output,
   which is backwards.
3. **Decide after reading rendered output.** The evidence that does not yet
   exist.

Option 3 first, then most likely option 1.

## Next

[Development](06-development.md) — running all of this.
