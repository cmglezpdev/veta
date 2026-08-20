import { VetaError } from "../errors/veta-error.ts";

/**
 * Which playlist members a run extracts: `--limit` / `--skip` / `--only` /
 * `--skip-only`, as pure list arithmetic.
 *
 * Positions are the curation vocabulary (see `position.ts`): every number a
 * user writes in a spec is a member's ORIGINAL 1-based playlist position, and
 * selection never renumbers — it only drops members. That is what keeps a
 * curated run's `NN-` folder prefixes aligned with the full playlist.
 *
 * Everything here throws `INPUT_UNRECOGNIZED` on bad input: these are usage
 * errors on the same footing as an unparseable URL, and they must be caught
 * before any network work begins.
 */

/** One inclusive 1-based span; a single position is `start === end`. */
export type PositionRange = {
  readonly start: number;
  readonly end: number;
};

/** The four flags, parsed and validated. Obtain via {@link parseMemberSelection}. */
export type MemberSelection = {
  /** Keep only these positions — or null when `--only` was not given. */
  readonly only: readonly PositionRange[] | null;
  /** Keep everything except these positions — or null when not given. */
  readonly skipOnly: readonly PositionRange[] | null;
  /** Members (not positions) to drop from the front after filtering. */
  readonly skip: number;
  /** Cap on how many members survive, applied last — or null for no cap. */
  readonly limit: number | null;
};

/** The flags as yargs hands them over: unvalidated, each possibly absent. */
export type RawSelectionFlags = {
  readonly limit?: number | undefined;
  readonly skip?: number | undefined;
  readonly only?: string | undefined;
  readonly skipOnly?: string | undefined;
};

/** `12` or `5-8`, with optional whitespace the split may have left around it. */
const ENTRY_PATTERN = /^(\d+)(?:-(\d+))?$/;

function invalid(flag: string, detail: string): VetaError {
  return new VetaError("INPUT_UNRECOGNIZED", `${flag} ${detail}`);
}

/**
 * Parse a `1,3,5-8` spec into ranges. `flag` names the offending option in
 * error messages, since `--only` and `--skip-only` share this grammar.
 */
export function parsePositionSpec(flag: string, spec: string): readonly PositionRange[] {
  const entries = spec.split(",").map((entry) => entry.trim());
  const ranges: PositionRange[] = [];

  for (const entry of entries) {
    const match = ENTRY_PATTERN.exec(entry);
    if (match === null) {
      throw invalid(
        flag,
        `has an invalid entry ${JSON.stringify(entry)}: expected comma-separated positions or ranges like "1,3,5-8".`,
      );
    }

    const start = Number(match[1]);
    const end = match[2] === undefined ? start : Number(match[2]);
    if (start < 1 || end < 1) {
      throw invalid(flag, `positions are 1-based; ${JSON.stringify(entry)} names position 0.`);
    }
    if (start > end) {
      throw invalid(flag, `range ${JSON.stringify(entry)} is reversed: ranges read low-high.`);
    }

    ranges.push({ start, end });
  }

  return ranges;
}

function requireCount(flag: string, value: number, floor: number): number {
  if (!Number.isInteger(value) || value < floor) {
    throw invalid(flag, `must be a whole number of at least ${floor}.`);
  }
  return value;
}

/**
 * Validate the four flags together. Null means "no curation asked for" — the
 * caller uses that to tell a plain run from a curated one (a single-video URL
 * rejects the latter). Throws on any invalid value or on combining `--only`
 * with `--skip-only`, which contradict each other by construction.
 */
export function parseMemberSelection(flags: RawSelectionFlags): MemberSelection | null {
  const { limit, skip, only, skipOnly } = flags;
  if (limit === undefined && skip === undefined && only === undefined && skipOnly === undefined) {
    return null;
  }

  if (only !== undefined && skipOnly !== undefined) {
    throw new VetaError("INPUT_UNRECOGNIZED", "--only and --skip-only cannot be combined.");
  }

  return {
    only: only === undefined ? null : parsePositionSpec("--only", only),
    skipOnly: skipOnly === undefined ? null : parsePositionSpec("--skip-only", skipOnly),
    skip: skip === undefined ? 0 : requireCount("--skip", skip, 0),
    limit: limit === undefined ? null : requireCount("--limit", limit, 1),
  };
}

function inRanges(position: number, ranges: readonly PositionRange[]): boolean {
  return ranges.some((range) => position >= range.start && position <= range.end);
}

/**
 * Apply a selection to the ordered member list: position filter first, then
 * `--skip`, then `--limit` — so skip/limit paginate whatever the filter kept.
 * Positions past the playlist's end simply match nothing; an empty result is
 * returned as-is, because only the caller knows listing already happened and
 * can phrase the "nothing selected" failure.
 */
export function selectMembers<T extends { readonly position: number }>(
  members: readonly T[],
  selection: MemberSelection,
): readonly T[] {
  let selected = members;

  if (selection.only !== null) {
    const ranges = selection.only;
    selected = selected.filter((member) => inRanges(member.position, ranges));
  }
  if (selection.skipOnly !== null) {
    const ranges = selection.skipOnly;
    selected = selected.filter((member) => !inRanges(member.position, ranges));
  }

  selected = selected.slice(selection.skip);
  return selection.limit === null ? selected : selected.slice(0, selection.limit);
}
