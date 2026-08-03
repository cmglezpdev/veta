import type { Dirent } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { VetaError } from "../../domain/errors/veta-error.ts";
import { asString, isRecord } from "../../domain/json.ts";
import type { RunRecord, RunSummary } from "../../domain/run/run-record.ts";
import { parseRunRecord, toRunSummary } from "../../domain/run/run-record.ts";
import { isValidDirName } from "../../domain/video/slug.ts";
import { type WorkDir, asWorkDir } from "../../ports/extraction-source.ts";
import type { RawArtifact } from "../../ports/extraction-source.ts";
import type { StorePort } from "../../ports/store.ts";
import { readJsonFile, writeJsonAtomic } from "./atomic-json.ts";
import { resolveWithin } from "./paths.ts";

/**
 * The filesystem, behind the port.
 *
 * Two files carry state. `{dataDir}/{dirName}/state.json` is the truth about a
 * run — what it did, where it stopped. `{dataDir}/index.json` is a catalog
 * derived from those state files, kept only so listing runs does not have to
 * open every package on disk.
 *
 * That asymmetry decides most of the behaviour here. The index is disposable:
 * missing, stale, torn, or written by a version veta does not know, it is
 * rebuilt from the packages themselves and nobody is told. A state file is not
 * disposable, so when the index says a run exists and its state file turns out
 * to be from the future, veta refuses instead of quietly forgetting the run.
 */

const INDEX_FILE = "index.json";
const STATE_FILE = "state.json";
const INDEX_SCHEMA_VERSION = 1;

/** Artifacts an interrupted run may have left behind, and that a reset may remove. */
const RESET_NAMES: readonly string[] = [
  "raw",
  "chapters",
  "chapters.partial",
  "transcript.md",
  "prompt.md",
  "metadata.json",
];

/** Thumbnails carry the source's extension, and any `.partial` is by definition debris. */
const RESET_PATTERNS: readonly RegExp[] = [/^cover\.[a-z0-9]+$/i, /\.partial$/];

export interface FsStoreOptions {
  /** Directory holding every package. Resolved by the CLI from flags or env. */
  readonly dataDir: string;
}

interface StoredIndex {
  readonly schemaVersion: typeof INDEX_SCHEMA_VERSION;
  readonly runs: readonly RunSummary[];
}

/** Whether a thrown filesystem error means "there was nothing there". */
function isMissing(error: unknown): boolean {
  return isRecord(error) && (error.code === "ENOENT" || error.code === "ENOTDIR");
}

/**
 * Read the catalog, or `null` when there is no catalog worth trusting.
 *
 * Entries that do not describe a package are dropped rather than failing the
 * whole read: one bad row should not cost the user the rest of the catalog.
 */
function parseIndex(value: unknown): readonly RunSummary[] | null {
  if (!isRecord(value)) return null;
  if (value.schemaVersion !== INDEX_SCHEMA_VERSION) return null;
  if (!Array.isArray(value.runs)) return null;

  const runs: RunSummary[] = [];
  for (const entry of value.runs) {
    if (!isRecord(entry)) continue;

    const externalId = asString(entry.externalId);
    const dirName = asString(entry.dirName);
    const updatedAt = asString(entry.updatedAt);
    if (externalId === null || dirName === null || updatedAt === null) continue;
    if (!isValidDirName(dirName)) continue;

    runs.push({ externalId, dirName, updatedAt });
  }

  return runs;
}

function byNewestFirst(a: RunSummary, b: RunSummary): number {
  return b.updatedAt.localeCompare(a.updatedAt);
}

export class FsStore implements StorePort {
  readonly #dataDir: string;

  constructor(options: FsStoreOptions) {
    this.#dataDir = path.resolve(options.dataDir);
  }

  async findRun(externalId: string): Promise<RunRecord | null> {
    const indexed = await this.#readIndexFile();
    const hit = indexed?.find((entry) => entry.externalId === externalId);

    if (hit) {
      // The index claimed this run, so a state file from the future is refused
      // rather than skipped — see the class comment.
      const record = await this.#readState(hit.dirName, { strict: true });
      if (record?.externalId === externalId) return record;
    }

    const scanned = await this.#scan();
    const found = scanned.find((record) => record.externalId === externalId) ?? null;

    if (found) await this.#writeIndex(scanned.map(toRunSummary));

    return found;
  }

  async saveRun(record: RunRecord): Promise<void> {
    const dir = this.#packageDir(record.dirName);
    await mkdir(dir, { recursive: true });

    // State first, always. The index can be rebuilt from state files; a state
    // file lost to a crash between the two writes cannot be rebuilt from an
    // index that never mentioned it.
    await writeJsonAtomic(path.join(dir, STATE_FILE), record);

    const entries = await this.#loadEntries();
    const summary = toRunSummary(record);
    const merged = entries.filter((entry) => entry.externalId !== record.externalId);
    merged.push(summary);

    await this.#writeIndex(merged);
  }

  async listRuns(): Promise<readonly RunSummary[]> {
    const entries = await this.#loadEntries();
    return [...entries].sort(byNewestFirst);
  }

  async rebuildIndex(): Promise<{ readonly recovered: number }> {
    const scanned = await this.#scan();
    const summaries = scanned.map(toRunSummary);

    await this.#writeIndex(summaries);

    return { recovered: summaries.length };
  }

  async openWorkDir(dirName: string): Promise<WorkDir> {
    const dir = this.#packageDir(dirName);
    await mkdir(dir, { recursive: true });
    return asWorkDir(dir);
  }

  async renameWorkDir(dir: WorkDir, newDirName: string): Promise<WorkDir> {
    const target = this.#packageDir(newDirName);
    if (target === dir) return asWorkDir(target);

    if (await this.#exists(target)) {
      throw new VetaError(
        "WORK_DIR_EXISTS",
        `A package directory named ${newDirName} already exists. ` +
          "Two videos resolved to the same name; remove or rename the existing one to continue.",
      );
    }

    await rename(dir, target);

    return asWorkDir(target);
  }

  async writeArtifact(
    dir: WorkDir,
    relPath: string,
    data: string | Uint8Array,
  ): Promise<RawArtifact> {
    const target = resolveWithin(dir, relPath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data);

    const bytes = typeof data === "string" ? Buffer.byteLength(data, "utf8") : data.byteLength;

    return { relPath, bytes };
  }

  async readArtifact(dir: WorkDir, relPath: string): Promise<Uint8Array | null> {
    const target = resolveWithin(dir, relPath);

    try {
      // Copied out of the Buffer so callers get the plain array the port promises.
      return new Uint8Array(await readFile(target));
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async replaceDir(
    dir: WorkDir,
    relDir: string,
    files: ReadonlyMap<string, string>,
  ): Promise<void> {
    const target = resolveWithin(dir, relDir);
    const staging = `${target}.partial`;

    // A half-written chapters/ directory is indistinguishable from a complete
    // one, so the whole set is staged beside the target and swapped in at once.
    await rm(staging, { force: true, recursive: true });

    try {
      await mkdir(staging, { recursive: true });

      for (const [name, content] of files) {
        const file = resolveWithin(staging, name);
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, content, "utf8");
      }

      await rm(target, { force: true, recursive: true });
      await rename(staging, target);
    } catch (error) {
      await rm(staging, { force: true, recursive: true });
      throw error;
    }
  }

  async resetWorkDir(dir: WorkDir): Promise<void> {
    let entries: string[];

    try {
      entries = await readdir(dir);
    } catch (error) {
      if (isMissing(error)) return;
      throw error;
    }

    // Deleting the directory would be one line and would also take state.json
    // and anything the user put there. Only names veta itself writes are removed.
    const doomed = entries.filter(
      (name) => RESET_NAMES.includes(name) || RESET_PATTERNS.some((pattern) => pattern.test(name)),
    );

    for (const name of doomed) {
      await rm(resolveWithin(dir, name), { force: true, recursive: true });
    }
  }

  /** Resolve a package directory, refusing any name that is not a valid `dirName`. */
  #packageDir(dirName: string): string {
    if (!isValidDirName(dirName)) {
      throw new VetaError(
        "PATH_ESCAPE",
        `Refusing to use ${JSON.stringify(dirName)} as a package directory name.`,
      );
    }

    return resolveWithin(this.#dataDir, dirName);
  }

  async #exists(target: string): Promise<boolean> {
    try {
      await stat(target);
      return true;
    } catch (error) {
      if (isMissing(error)) return false;
      throw error;
    }
  }

  async #readIndexFile(): Promise<readonly RunSummary[] | null> {
    return parseIndex(await readJsonFile(path.join(this.#dataDir, INDEX_FILE)));
  }

  /** The catalog if it can be trusted, otherwise what the packages themselves say. */
  async #loadEntries(): Promise<readonly RunSummary[]> {
    const indexed = await this.#readIndexFile();
    if (indexed) return indexed;

    return (await this.#scan()).map(toRunSummary);
  }

  async #writeIndex(runs: readonly RunSummary[]): Promise<void> {
    const index: StoredIndex = {
      schemaVersion: INDEX_SCHEMA_VERSION,
      runs: [...runs].sort(byNewestFirst),
    };

    await mkdir(this.#dataDir, { recursive: true });
    await writeJsonAtomic(path.join(this.#dataDir, INDEX_FILE), index);
  }

  /**
   * Read one package's state file.
   *
   * `strict` decides what a malformed payload means. Reading a run the index
   * promised, it is an error worth showing. Reading during a scan, where every
   * directory under `dataDir` is a candidate, it is just a directory that is not
   * ours.
   */
  async #readState(dirName: string, options: { strict: boolean }): Promise<RunRecord | null> {
    if (!isValidDirName(dirName)) return null;

    const file = resolveWithin(this.#dataDir, dirName, STATE_FILE);
    const raw = await readJsonFile(file);
    if (raw === null) return null;

    try {
      return parseRunRecord(raw);
    } catch (error) {
      if (options.strict) throw error;
      return null;
    }
  }

  /**
   * Every package the data directory actually holds.
   *
   * `dataDir` defaults to wherever the user ran veta, so the scan has to assume
   * most of what it sees is not veta's: it stays at the top level, and skips
   * anything without a parseable state file. Where a state file and the disk
   * disagree about `dirName`, the disk wins — it is what a rename left behind.
   */
  async #scan(): Promise<readonly RunRecord[]> {
    let entries: Dirent[];

    try {
      entries = await readdir(this.#dataDir, { withFileTypes: true });
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }

    const found: RunRecord[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!isValidDirName(entry.name)) continue;

      const record = await this.#readState(entry.name, { strict: false });
      if (record === null) continue;
      if (!isValidDirName(record.dirName)) continue;

      found.push({ ...record, dirName: entry.name });
    }

    return found;
  }
}
