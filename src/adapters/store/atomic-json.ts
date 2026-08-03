import { readFile, rename, rm, writeFile } from "node:fs/promises";

/**
 * JSON files that survive being interrupted.
 *
 * `state.json` is the only record of where a run stopped, and `index.json` is
 * the catalog the CLI lists. A Ctrl-C in the middle of `writeFile` would leave
 * either of them half-written, and a half-written state file is worse than no
 * state file at all — it fails to parse on the next run and takes resume with
 * it. Writing to a sibling and renaming makes the swap atomic: a reader sees
 * the old file or the new one, never a torn one.
 */

const PARTIAL_SUFFIX = ".partial";

function serialize(value: unknown): string {
  const json = JSON.stringify(value, null, 2);

  if (json === undefined) {
    throw new TypeError("Refusing to write a payload that JSON.stringify cannot represent.");
  }

  return `${json}\n`;
}

/**
 * Write `value` as pretty-printed JSON, atomically.
 *
 * Serialization happens before any file is touched, so a payload that cannot be
 * represented (circular, `undefined`, a BigInt) leaves the existing file exactly
 * as it was. Should the write or rename fail, the partial is removed rather than
 * left behind to confuse the next reader.
 *
 * A failure here is a bug in veta rather than a condition in the world, so it
 * surfaces as an ordinary Error with a stack trace, not a `VetaError`.
 */
export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const text = serialize(value);
  const partial = `${filePath}${PARTIAL_SUFFIX}`;

  try {
    await writeFile(partial, text, "utf8");
    await rename(partial, filePath);
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
}

/**
 * Read JSON from disk, or `null` when there is nothing usable to read.
 *
 * Missing, unreadable, empty, and syntactically broken files all answer `null`,
 * because every caller responds the same way: treat the file as absent and
 * rebuild from the packages on disk. Validating the *shape* of what parsed is a
 * separate job and belongs to the domain parsers, which refuse loudly with
 * `PAYLOAD_SHAPE_CHANGED`.
 */
export async function readJsonFile(filePath: string): Promise<unknown> {
  let text: string;

  try {
    text = await readFile(filePath, "utf8");
  } catch {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
