# yt-dlp fixtures

Real captured payloads. Tests in tier 3 parse these instead of hitting the
network, so parsing stays honest without making CI depend on YouTube.

Do not hand-edit these files. Regenerate them with `scripts/capture-fixture.ts`
(T7.4) once it exists; until then they were produced by the commands below.

## Provenance

| | |
|---|---|
| Video | `1VqKUrxR2C8` — "Building OpenCode with Dax Raad" |
| Captured | 2026-07-28 |
| yt-dlp | 2026.07.04 (`release_git_head` 997fa140840a08df3938b40da470c78049fef1f6) |
| Duration | 4861 s |
| Chapters | 21 |
| Original language | `en-US` |
| Auto-caption tracks | 157 (2 non-translated) |
| Manual subtitle tracks | 0 — this video has no author-uploaded captions |

Commands:

```sh
yt-dlp --ignore-config --no-playlist --skip-download --no-progress \
       --write-info-json --socket-timeout 30 -o "%(id)s" <url>

yt-dlp --ignore-config --no-playlist --skip-download --no-progress \
       --write-auto-subs --sub-langs en --sub-format json3 \
       --socket-timeout 30 -o "%(id)s" <url>
```

## Files

### `info.json` — sliced

- **Caption map sliced to 5 of 157 tracks**: `en` and `en-orig` (the two
  non-translated tracks) plus `es`, `fr`, `de` (machine translations, each
  carrying `tlang=`). Keeping both classes is what lets the translation
  detection assertions run at all.
- **All 21 chapters preserved, unsliced.** The calibration gate needs every
  chapter boundary, so this array must never be trimmed.
- **`ip=` is redacted to `0.0.0.0` in every retained URL.** See the deviation
  note below — this is the one intentional edit to captured bytes.
- **Dropped**: `formats`, `thumbnails`, `heatmap`, `requested_formats`,
  `requested_downloads`. None are read by `parseInfoJson`, they account for
  most of the payload size, and `formats[].url` also embeds the capturing
  machine's public IP.
- Everything else is verbatim, including caption URL query strings, because
  `tlang=` is the primary translation signal.

### `captions.full.en.json3` — unsliced

The complete payload, 1,950,088 bytes, 5,160 events. Committed in full
because the segmentation calibration gate cannot run on a sample: its bounds
are distribution-level properties.

### `captions.en.json3` — sliced

`events[356:456]` of the full payload — 100 events, 50 content cues, spanning
332 s to 424 s. The window was chosen as the smallest one provably containing
all of:

| Property | Count in window |
|---|---|
| Filler events (`segs` joining to whitespace only) | 50 |
| Multi-segment events | 50 |
| Inter-cue gap ≥ 1000 ms (`PAUSE_STRONG_MS`) | 1 |
| Chapter boundary, with both adjacent cues inside the window | 1 |
| Inter-cue run-together site | 1 |

All top-level keys (`pens`, `wireMagic`, `wpWinPositions`, `wsWinStyles`) are
preserved so the sliced file has the same shape as the full one.

### `thumbnail.png` — synthetic

A minimal valid 1×1 PNG (70 bytes), not a captured payload. The fake yt-dlp
in the tests copies it wherever `--write-thumbnail` asks, so thumbnail
handling exercises a real image file without committing a real cover.

### `stderr-success.txt`

Real stderr from a clean exit-0 run. It carries an impersonation warning,
which is the point: yt-dlp writes `WARNING:` lines on *successful* runs, so
classifying failures by stderr signature alone would invent failures out of
successes. Exit code must gate classification.

## Measurements

Re-measured against this capture on 2026-07-28. These are what the
segmentation constants are derived from.

| Statistic | Value |
|---|---|
| Content cues | 2,580 |
| Filler events dropped | 2,580 |
| Inter-cue gaps that are negative | **0** |
| Gap min / median / p90 / p99 / max | 0 / 240 / 480 / 1136 / 2770 ms |
| Gaps ≥ 700 / 1000 / 1500 / 2000 ms | 117 / 39 / 14 / 3 |
| Cues ending in terminal punctuation | 176 of 2,580 (6.8%) |
| Non-first segments beginning with a space | 15,892 of 15,892 (100%) |

## Deviations from the design, and why

Three things the design assumed did not survive contact with the real payload.
Recorded here rather than silently absorbed.

### 1. Caption URLs carry the capturing machine's public IP

The design says caption URLs are retained "unredacted because `tlang=` is
load-bearing". That reasoning is sound but incomplete: all 1,099 caption URLs
in the raw capture carry an `ip=` parameter holding the public IP of whoever
ran the capture, and this repository is intended to become public.

`tlang=` is what is load-bearing, not `ip=`. So `ip=` is redacted to
`0.0.0.0` and every other parameter — including `tlang=` — is kept verbatim.
Translation detection is unaffected.

**Any future capture tool must apply the same redaction.**

### 2. There is no mid-word `segs` split in this payload

The design requires the sliced window to contain "a mid-word `segs` split".
No such split exists: every one of the 15,892 non-first segments begins with
a space, with zero exceptions.

What that fixture requirement was really meant to prove — that segments must
be concatenated **verbatim** rather than space-joined — still holds, and is
in fact proven more strongly: since every segment already carries its own
leading space, a naive `' '.join(segs)` produces doubled spaces throughout.
The window therefore requires a multi-segment event instead.

### 3. Word count is 18,602, not 16,023

The design records 16,023 words for this video; counting whitespace-separated
tokens over the normalized cue text gives 18,602, about 16% higher. Only 12
bracketed annotations exist, so those do not explain the gap; the two counts
were simply taken by different rules.

This does not affect any segmentation rule, because every quantity the rules
actually consume — cue count, gap distribution, punctuation rate — reproduced
exactly. It does shift the *predicted* paragraph count proportionally, so the
design's "~130–145 paragraphs" estimate should be read as roughly 150–170
against this measurement. The calibration gate asserts ranges, not that
prediction, so its bounds stand.
