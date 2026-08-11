import type { StorePort } from "../ports/store.ts";
import { confirmYesNo } from "./confirm.ts";

export type PurgeResult = {
  /** Whether the user answered yes to the confirmation prompt. */
  readonly confirmed: boolean;
  /** How many package directories the store removed; 0 when declined. */
  readonly removed: number;
};

/**
 * The `veta purge` command: wipe every stored extraction, but only on an
 * explicit yes.
 *
 * Streams are parameters rather than `process` globals so a test can drive the
 * exchange with real `PassThrough` pipes. The default answer is No, and the
 * store is not touched at all on a decline — deleting everything a user has
 * ever extracted must never happen by accident.
 */
export async function purge(
  store: StorePort,
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream,
): Promise<PurgeResult> {
  output.write("This removes every stored package and the index from the data directory.\n");

  const accepted = await confirmYesNo(
    input,
    output,
    "Permanently delete all stored extraction data?",
  );

  if (!accepted) {
    output.write("Aborted. Nothing was deleted.\n");
    return { confirmed: false, removed: 0 };
  }

  const { removed } = await store.purge();
  output.write(`Removed ${removed} package(s) from the data directory.\n`);

  return { confirmed: true, removed };
}
