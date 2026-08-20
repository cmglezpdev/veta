/**
 * Minimal semver ordering for the update check.
 *
 * Only `major.minor.patch` decides; a prerelease tag matters in exactly one
 * way — a prerelease of the same core is not an upgrade over the stable
 * release. Anything that does not parse answers `false`, because a notice
 * built on a guess is worse than no notice.
 */

type Core = { readonly nums: readonly [number, number, number]; readonly prerelease: boolean };

function parse(version: string): Core | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/.exec(version.trim());
  if (match === null) {
    return null;
  }
  return {
    nums: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] !== undefined,
  };
}

export function isNewerVersion(latest: string, current: string): boolean {
  const a = parse(latest);
  const b = parse(current);
  if (a === null || b === null) {
    return false;
  }
  for (let i = 0; i < 3; i += 1) {
    if (a.nums[i]! !== b.nums[i]!) {
      return a.nums[i]! > b.nums[i]!;
    }
  }
  // Same core: only "stable beats prerelease" counts as newer.
  return b.prerelease && !a.prerelease;
}
