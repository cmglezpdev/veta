/**
 * Safe per-video directory names from a human title, with a durable fallback.
 *
 * Slugs are cosmetic — `externalId` is the real identity — but they still have
 * to survive hostile titles, Windows reserved names, and filesystem limits
 * without asking the user to rename anything.
 */

const MAX_SLUG_LENGTH = 60;

const WINDOWS_RESERVED = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9",
]);

/** Any Unicode combining mark (`\p{M}`): the accents NFKD splits off its base letter. */
const COMBINING_MARK = /\p{M}/gu;

/** A run of one or more characters outside `a-z0-9` — everything a slug may not keep. */
const NON_SLUG = /[^a-z0-9]+/g;

/** Whole string: an alphanumeric first character, then alphanumerics, dots, underscores or hyphens. */
const VALID_DIR_NAME = /^[a-z0-9][a-z0-9._-]*$/;

/**
 * Fold accented characters down to their ASCII base letter.
 *
 * NFKD decomposes `é` into `e` + combining acute; removing the mark leaves the
 * `e` behind, so `Café` survives as `cafe` instead of being erased by
 * {@link NON_SLUG}.
 */
function stripCombiningMarks(value: string): string {
  return value.normalize("NFKD").replace(COMBINING_MARK, "");
}

/**
 * Squash repeated hyphens into one and trim the hyphens left at either end.
 *
 * Replacing every non-slug run with `-` tends to produce doubles and edges, and
 * a leading hyphen would break the {@link VALID_DIR_NAME} contract.
 */
function collapseHyphens(value: string): string {
  return (
    value
      // one or more consecutive hyphens -> a single hyphen
      .replace(/-+/g, "-")
      // a hyphen run anchored at the start (`^-+`) or at the end (`-+$`) -> removed
      .replace(/^-+|-+$/g, "")
  );
}

/**
 * Cut the slug down to `maxLength`, preferring a word boundary over a mid-word cut.
 *
 * When the truncated slice still contains a hyphen, the trailing partial word is
 * dropped; otherwise the hard slice is kept as-is (a single very long word).
 */
function truncateAtHyphen(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;

  const slice = value.slice(0, maxLength);
  const lastHyphen = slice.lastIndexOf("-");
  if (lastHyphen > 0) return slice.slice(0, lastHyphen);

  return slice;
}

/**
 * Prefix `v-` when the leading segment collides with a Windows device name.
 *
 * Windows refuses `CON`, `NUL`, `COM1`… as file or directory names regardless of
 * what follows the first dot, so the stem is what has to be checked.
 */
function escapeWindowsReserved(value: string): string {
  // split on every dot or hyphen and keep the first field: the stem Windows looks at
  const stem = (value.split(/[.-]/)[0] ?? value).toLowerCase();
  return WINDOWS_RESERVED.has(stem) ? `v-${value}` : value;
}

/**
 * Remove trailing dots and whitespace.
 *
 * Windows silently strips them when creating a directory, which would leave the
 * on-disk name different from the one recorded in the package.
 */
function stripTrailingDotsAndSpaces(value: string): string {
  // a run of dots or whitespace anchored at the end of the string
  return value.replace(/[.\s]+$/g, "");
}

/**
 * Derive a filesystem-safe directory name from a video title.
 *
 * The title runs through the whole pipeline in order: fold accents, lowercase,
 * replace non-slug runs with hyphens, collapse hyphens, truncate, escape Windows
 * device names, and drop trailing dots and spaces.
 *
 * @param title - Human-readable video title; may be empty or fully non-ASCII.
 * @param externalId - Durable video identity, used as the fallback name.
 * @returns A name satisfying {@link isValidDirName}, falling back to a lowercased
 * `externalId` when the title produces nothing usable.
 */
export function slugify(title: string, externalId: string): string {
  let slug = stripCombiningMarks(title).toLowerCase();
  // every run of non-slug characters becomes a single hyphen
  slug = slug.replace(NON_SLUG, "-");
  slug = collapseHyphens(slug);
  slug = truncateAtHyphen(slug, MAX_SLUG_LENGTH);
  slug = escapeWindowsReserved(slug);
  slug = stripTrailingDotsAndSpaces(slug);

  if (slug.length === 0) {
    slug = externalId.toLowerCase();
  }

  return slug;
}

/**
 * Whether a name satisfies the on-disk `dirName` contract (§2.2).
 *
 * `.` and `..` are rejected explicitly because they are valid path components
 * that would resolve outside the intended directory.
 *
 * @param name - Candidate directory name, usually the output of {@link slugify}.
 */
export function isValidDirName(name: string): boolean {
  if (name === "." || name === "..") return false;
  return VALID_DIR_NAME.test(name);
}
