import type { RunRecord, RunSummary } from "../domain/run/run-record.ts";
import type { RawArtifact, WorkDir } from "./extraction-source.ts";

/**
 * Filesystem catalog and package I/O.
 *
 * Package directories use flat layout `{dataDir}/{dirName}/` with
 * `{dataDir}/index.json` at the data root — never nested under `videos/`.
 *
 * Roots and language come from CLI flags / env per invocation — there is no
 * persisted user config file in Slice 5 (YAGNI).
 */
export interface StorePort {
  findRun(externalId: string): Promise<RunRecord | null>;
  saveRun(record: RunRecord): Promise<void>;
  listRuns(): Promise<readonly RunSummary[]>;
  /**
   * Full records for every stored run, newest first, straight from a disk
   * scan — a {@link RunSummary} carries no steps, so status derivation needs
   * the records themselves.
   */
  listRunRecords(): Promise<readonly RunRecord[]>;
  rebuildIndex(): Promise<{ readonly recovered: number }>;
  openWorkDir(dirName: string): Promise<WorkDir>;
  renameWorkDir(dir: WorkDir, newDirName: string): Promise<WorkDir>;
  writeArtifact(
    dir: WorkDir,
    relPath: string,
    data: string | Uint8Array,
  ): Promise<RawArtifact>;
  readArtifact(dir: WorkDir, relPath: string): Promise<Uint8Array | null>;
  replaceDir(dir: WorkDir, relDir: string, files: ReadonlyMap<string, string>): Promise<void>;
  resetWorkDir(dir: WorkDir): Promise<void>;
  /**
   * Permanently delete every stored package directory and the index, leaving
   * foreign entries in the data directory untouched. Returns the number of
   * package directories removed.
   */
  purge(): Promise<{ readonly removed: number }>;
}
