import { firstIncompleteStep } from "../domain/run/resume.ts";
import type { StorePort } from "../ports/store.ts";

/**
 * The `veta list` command: every stored extraction, newest first, one per line.
 *
 * Writes only data lines — `<dirName>  <updatedAt>  <status>` with the name
 * column padded to the longest entry — so the output stays script-friendly.
 * An empty store writes nothing; the caller owns any "nothing here" message.
 */
export async function list(
  store: StorePort,
  output: NodeJS.WritableStream,
): Promise<{ count: number }> {
  const records = await store.listRunRecords();
  const width = Math.max(0, ...records.map((record) => record.dirName.length));

  for (const record of records) {
    const pending = firstIncompleteStep(record);
    const status = pending === null ? "complete" : `incomplete: ${pending}`;
    output.write(`${record.dirName.padEnd(width)}  ${record.updatedAt}  ${status}\n`);
  }

  return { count: records.length };
}
