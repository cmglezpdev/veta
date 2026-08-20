import type { PlaylistMemberRecord, PlaylistRecord } from "../domain/run/playlist-record.ts";
import { firstIncompleteStep } from "../domain/run/resume.ts";
import type { RunRecord } from "../domain/run/run-record.ts";
import { isPlaylistRecord } from "../domain/run/stored-record.ts";
import type { StorePort } from "../ports/store.ts";

function runLine(record: RunRecord, width: number): string {
  const pending = firstIncompleteStep(record);
  const status = pending === null ? "complete" : `incomplete: ${pending}`;
  return `${record.dirName.padEnd(width)}  ${record.updatedAt}  ${status}\n`;
}

function playlistLine(record: PlaylistRecord, width: number): string {
  const extracted = record.members.filter((m) => m.status === "extracted").length;
  const gaps = record.members.length - extracted;
  const status =
    gaps === 0
      ? `playlist: ${extracted}/${record.totalCount} extracted`
      : `playlist: ${extracted}/${record.totalCount} extracted, ${gaps} not included`;
  return `${record.dirName.padEnd(width)}  ${record.updatedAt}  ${status}\n`;
}

/** A playlist member that never resolved to its own package (failed/unavailable). */
function memberGapLine(member: PlaylistMemberRecord): string {
  return `  #${member.position}  ${member.status}${member.errorCode !== null ? `: ${member.errorCode}` : ""}\n`;
}

/**
 * The `veta list` command: every stored extraction, newest first, with each
 * playlist's member rows grouped directly beneath it. A video belonging to a
 * playlist is shown once, nested there — never again at the top level, and
 * never twice even when it belongs to more than one playlist. An empty store
 * writes nothing; the caller owns any "nothing here" message.
 */
export async function list(
  store: StorePort,
  output: NodeJS.WritableStream,
): Promise<{ count: number }> {
  const records = await store.listStoredRecords();
  const width = Math.max(0, ...records.map((record) => record.dirName.length));

  const runsByDirName = new Map<string, RunRecord>();
  const memberOf = new Set<string>();
  for (const record of records) {
    if (isPlaylistRecord(record)) {
      for (const member of record.members) {
        if (member.dirName !== null) memberOf.add(member.dirName);
      }
    } else {
      runsByDirName.set(record.dirName, record);
    }
  }

  const printedMembers = new Set<string>();
  let count = 0;

  for (const record of records) {
    if (isPlaylistRecord(record)) {
      output.write(playlistLine(record, width));
      count += 1;

      for (const member of record.members) {
        if (member.dirName !== null && printedMembers.has(member.dirName)) continue;
        if (member.dirName !== null) printedMembers.add(member.dirName);

        const run = member.dirName !== null ? runsByDirName.get(member.dirName) : undefined;
        output.write(run !== undefined ? `  ${runLine(run, Math.max(0, width - 2))}` : memberGapLine(member));
        count += 1;
      }
      continue;
    }

    if (memberOf.has(record.dirName)) continue; // shown nested under its playlist(s)
    output.write(runLine(record, width));
    count += 1;
  }

  return { count };
}
