# 3. Data sources

## Why yt-dlp

veta does not talk to YouTube directly. It shells out to
[`yt-dlp`](https://github.com/yt-dlp/yt-dlp).

This was not the original plan. The first design used `youtubei.js`, a
JavaScript client, to avoid depending on an external binary. A live probe
killed that: `getTranscript()` fails against YouTube's PO Token requirement,
and no combination of client options got around it. yt-dlp works because it
maintains that arms race full time, which is exactly the work we do not want
to be doing.

The cost is honest: veta needs a `yt-dlp` binary present at runtime, and its
error messages have to say so clearly when one is not. See
[Development](06-development.md#the-yt-dlp-binary).

## Two files, two different jobs

One extraction produces two payloads, and they are complementary — neither
is useful alone.

| | Analogous to | Contains |
|---|---|---|
| **`info.json`** | The cover and table of contents | Title, duration, channel, thumbnail, **the chapters**, and the list of available subtitle tracks |
| **`captions.json3`** | The text of the book | The 2,580 cues: what is said, and when |

**`info.json` contains not one word of what is spoken.** It is data *about*
the video.

**`json3` has no idea chapters exist.** It is a flat list of timed fragments.

The output document needs both: json3 says *"at 7 minutes 30, this was
said"*, and info.json says *"chapter 2 starts at 7 minutes 3"*. Crossing them
is how a fragment learns which section it belongs to.

## `info.json`

Produced by `--write-info-json`. A large payload — 573 KB for the reference
video — of which we read a small part.

Parsed by `src/adapters/ytdlp/info-json.ts` into `VideoMetadata`:

| Field read | Becomes | Notes |
|---|---|---|
| `id`, `title` | `id`, `title` | Missing either is a shape change upstream, and fails loudly |
| `duration` | `durationSec` | |
| `uploader` | `uploader` | |
| `thumbnail` | `thumbnailUrl` | A URL, not image bytes — downloading is a separate step |
| `webpage_url` | `canonicalUrl` | The base for per-paragraph deep links |
| `chapters[]` | `Chapter[]` | `start_time` and `end_time`, both confirmed present |

Chapters are **sorted on parse**, defensively. Nothing guarantees the source
orders them, and every consumer downstream assumes they ascend.

Everything else in the payload — the `formats` array, thumbnails, the
heatmap — is ignored.

## `json3`

Produced by `--write-auto-subs --sub-format json3`. This is YouTube's own
JSON caption format, and it is the richest of the available formats: unlike
`vtt` or `srv1`, it carries per-word timing.

Structure:

```
{
  "wireMagic": "pb3",
  "events": [
    { "tStartMs": 431000, "dDurationMs": 4200,
      "segs": [ { "utf8": "…", "tOffsetMs": 0 },
                { "utf8": "…", "tOffsetMs": 320 } ] },
    …
  ]
}
```

Three things about this shape drive the whole parser:

**Events are not all content.** Of the reference video's 5,160 events,
exactly half — 2,580 — are spacers whose text is a single newline. They are
dropped.

**Segments are words, and they carry their own spacing.** Every one of the
15,892 non-first segments begins with a space, without exception. So segments
are concatenated verbatim; joining them with a space would double every one.

**`dDurationMs` is a trap.** It is present on every content event and looks
like the obvious way to compute when a cue ends. It is the *display* window,
which deliberately overlaps the next cue. Using it makes every measured pause
negative. It is never read — see
[Normalization](04-normalization.md#the-endms-decision).

## Tracks and translations

The reference video offers **157 caption tracks**. Exactly **two** are real:
`en` and `en-orig`, which for this video are byte-identical. The remaining
155 are machine translations of the auto-generated English transcript —
translating an already-imperfect transcription, so quality degrades twice.

Selecting one of those 155 by accident is a real failure mode, and neither
the key name nor the display name reliably tells you which is which.

### The rule: a track is a translation if and only if its URL carries `tlang=`

```ts
isTranslation = new URL(format.url).searchParams.has("tlang");
```

Structural, language-independent, and it states the property directly instead
of inferring it from a naming convention.

Two alternatives were rejected:

| Signal | Verdict |
|---|---|
| Display name contains "(Original)" | **Rejected.** That text is localized — it is an artifact of the interface language the request was made under, not a property of the track |
| Key ends in `-orig` | **Demoted to a fallback.** It is structural, but it only answers "is this the original-language track", and only when such a key exists. It cannot tell you that `es` is a translation |

The decisive case is one this video cannot show. Here `en` and `en-orig` are
identical because the video's original language *is* English. **For a
Spanish-original video, `en` would carry `tlang=en`** and the `-orig` suffix
would attach to `es`. A rule built on the suffix alone would have no way to
reject the translated siblings; `tlang` rejects them without needing the
`-orig` key to exist at all.

The `-orig` handling is still implemented, as the designed fallback for when
a track has no parseable URL.

> This is why `tlang` is on the vocabulary-containment list in
> [Architecture](02-architecture.md#enforcement): it is a wire-level
> parameter name, and only `info-json.ts` may read it.

## Test fixtures

Parsing is tested against real captured payloads, not hand-written JSON. Hand
written fixtures test your idea of the format; captured ones test the format.

The captured set lives in `src/adapters/ytdlp/__fixtures__/`, and
**`FIXTURES.md` in that directory** documents which video, which yt-dlp
version, what was trimmed and why — including three places where the design's
assumptions did not survive contact with the real payload.

One deviation is worth repeating here because it applies to any future
capture tooling: **caption URLs embed the public IP of whoever ran the
capture.** They are otherwise retained verbatim, because `tlang=` is
load-bearing, but `ip=` is redacted to `0.0.0.0`.

## Next

[Normalization](04-normalization.md) — turning 2,580 fragments into readable
text.
