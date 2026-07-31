/**
 * Language tag handling, kept deliberately small.
 *
 * A full BCP-47 parser would be the wrong tool here, and not because it is
 * heavy: YouTube emits caption keys that are not valid BCP-47 at all. `en-orig`
 * carries a four-letter subtag that a conformant parser reads as a script tag,
 * which it is not — so a correct library either rejects the key or mangles it.
 *
 * What the selection logic actually needs is narrower: compare a caption key
 * against the video's language, and recognise the one non-standard suffix
 * YouTube uses. Both are below.
 */

/**
 * The primary subtag, lowercased.
 *
 * `en-US` -> `en`, `es-419` -> `es`, `en-orig` -> `en`, `EN` -> `en`.
 *
 * This exists because `info.language` is a locale (`en-US`) while caption keys
 * are usually base subtags (`en`). Comparing them raw finds nothing, which is
 * exactly the bug that makes a selector fall through to "first key in the map"
 * — and the map has 157 entries.
 */
export function baseSubtag(tag: string): string {
  const [primary = ""] = tag.trim().toLowerCase().split("-");
  return primary;
}

/**
 * Whether a caption key is YouTube's marker for the original-language track.
 *
 * A SECONDARY signal only. It answers "is this the original-language track",
 * which is not the same question as "is this content machine-translated" — a
 * key like `es` carries no `-orig` suffix and may or may not be a translation.
 * The primary signal for that lives on the track's media URL and is read in
 * the source adapter, which is the only layer allowed to know its name.
 *
 * It stays useful for two things: disambiguating `en` from `en-orig` when both
 * are untranslated, and keeping a non-BCP-47 key out of naive tag matching.
 */
export function isOriginalMarker(key: string): boolean {
  return /^[a-z]{2,3}-orig$/i.test(key.trim());
}
