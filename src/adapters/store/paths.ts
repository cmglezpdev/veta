import path from "node:path";
import { VetaError } from "../../domain/errors/veta-error.ts";

/**
 * Path composition for everything the store touches on disk.
 *
 * Every path the store writes to, reads from, or deletes is built here and
 * nowhere else. That is the whole point: a single function is something a
 * reviewer can read once and trust, whereas `path.join` scattered across nine
 * methods is nine chances to write outside the directory the user pointed at.
 */

const SEPARATORS = /[\\/]/;

function refuse(root: string, segment: string, reason: string): never {
  throw new VetaError(
    "PATH_ESCAPE",
    `Refusing to resolve ${JSON.stringify(segment)} inside ${root}: ${reason}.`,
  );
}

/**
 * Resolve `segments` below `root`, refusing anything that could leave it.
 *
 * Segments are rejected outright — not normalized away — when they are empty,
 * absolute, contain a NUL byte, or contain a `..` component. A `..` that would
 * have landed back inside the root is still refused: the rule a reader has to
 * verify should be "no segment may contain `..`", not "the arithmetic happens
 * to work out". Names that merely look like traversal (`..hidden.md`) are
 * ordinary names and pass.
 *
 * @param root Containing directory. Resolved against the process cwd when relative.
 * @throws VetaError `PATH_ESCAPE` when a segment could resolve outside `root`.
 */
export function resolveWithin(root: string, ...segments: string[]): string {
  const base = path.resolve(root);

  for (const segment of segments) {
    if (segment === "") {
      refuse(base, segment, "the segment is empty");
    }
    if (segment.includes("\0")) {
      refuse(base, segment, "the segment contains a NUL byte");
    }
    if (path.isAbsolute(segment)) {
      refuse(base, segment, "the segment is an absolute path");
    }
    if (segment.split(SEPARATORS).includes("..")) {
      refuse(base, segment, "the segment walks up with '..'");
    }
  }

  const resolved = path.resolve(base, ...segments);

  // Defence in depth. Nothing above should be able to reach this, but the cost
  // of being wrong here is writing outside the user's data directory.
  const relative = path.relative(base, resolved);
  if (relative.split(SEPARATORS).includes("..") || path.isAbsolute(relative)) {
    refuse(base, segments.join(path.sep), "the result resolves outside the root");
  }

  return resolved;
}
