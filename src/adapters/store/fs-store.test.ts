import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isVetaError } from "../../domain/errors/veta-error.ts";
import { createRunRecord } from "../../domain/run/run-record.ts";
import type { RunRecord } from "../../domain/run/run-record.ts";
import type { WorkDir } from "../../ports/extraction-source.ts";
import { FsStore } from "./fs-store.ts";

const roots: string[] = [];

async function tempStore(): Promise<{ store: FsStore; dataDir: string }> {
  const dataDir = await mkdtemp(path.join(tmpdir(), "veta-store-"));
  roots.push(dataDir);
  return { store: new FsStore({ dataDir }), dataDir };
}

function record(overrides: Partial<RunRecord> & { externalId: string; dirName: string }): RunRecord {
  return createRunRecord({
    selectedTrack: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });
}

async function codeOf(action: () => Promise<unknown>): Promise<string> {
  try {
    await action();
  } catch (error) {
    return isVetaError(error) ? error.code : `not-a-veta-error: ${String(error)}`;
  }
  return "no-throw";
}

/** Plant a package on disk the way a previous run would have left it. */
async function plantPackage(dataDir: string, dirName: string, state: unknown): Promise<string> {
  const dir = path.join(dataDir, dirName);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "state.json"), JSON.stringify(state), "utf8");
  return dir;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

describe("FsStore.openWorkDir", () => {
  it("creates the package directory flat under the data directory", async () => {
    const { store, dataDir } = await tempStore();

    const dir = await store.openWorkDir("my-video");

    expect(dir).toBe(path.join(dataDir, "my-video"));
    expect(await readdir(dataDir)).toEqual(["my-video"]);
  });

  it("never introduces a videos/ level", async () => {
    const { store, dataDir } = await tempStore();

    await store.openWorkDir("my-video");

    expect(await readdir(dataDir)).not.toContain("videos");
  });

  it("keeps existing content when reopened", async () => {
    const { store } = await tempStore();
    const dir = await store.openWorkDir("my-video");
    await writeFile(path.join(dir, "transcript.md"), "kept", "utf8");

    await store.openWorkDir("my-video");

    expect(await readFile(path.join(dir, "transcript.md"), "utf8")).toBe("kept");
  });

  it("refuses a dirName that walks up", async () => {
    const { store } = await tempStore();

    expect(await codeOf(() => store.openWorkDir("../escape"))).toBe("PATH_ESCAPE");
  });

  it("refuses a dirName outside the on-disk name contract", async () => {
    const { store } = await tempStore();

    expect(await codeOf(() => store.openWorkDir("Has Spaces"))).toBe("PATH_ESCAPE");
  });
});

describe("FsStore.renameWorkDir", () => {
  it("moves the directory and everything inside it", async () => {
    const { store, dataDir } = await tempStore();
    const dir = await store.openWorkDir("dqw4w9wgxcq");
    await mkdir(path.join(dir, "raw"), { recursive: true });
    await writeFile(path.join(dir, "raw", "info.json"), "{}", "utf8");

    const renamed = await store.renameWorkDir(dir, "never-gonna-give-you-up");

    expect(renamed).toBe(path.join(dataDir, "never-gonna-give-you-up"));
    expect(await readFile(path.join(renamed, "raw", "info.json"), "utf8")).toBe("{}");
    expect(await readdir(dataDir)).toEqual(["never-gonna-give-you-up"]);
  });

  it("returns the same directory when the name is unchanged", async () => {
    const { store } = await tempStore();
    const dir = await store.openWorkDir("my-video");

    expect(await store.renameWorkDir(dir, "my-video")).toBe(dir);
  });

  it("refuses to overwrite a package that already holds the target name", async () => {
    const { store } = await tempStore();
    const dir = await store.openWorkDir("dqw4w9wgxcq");
    const taken = await store.openWorkDir("same-title");
    await writeFile(path.join(taken, "transcript.md"), "someone else's work", "utf8");

    expect(await codeOf(() => store.renameWorkDir(dir, "same-title"))).toBe("WORK_DIR_EXISTS");
    expect(await readFile(path.join(taken, "transcript.md"), "utf8")).toBe("someone else's work");
  });

  it("refuses a target name that walks up", async () => {
    const { store } = await tempStore();
    const dir = await store.openWorkDir("my-video");

    expect(await codeOf(() => store.renameWorkDir(dir, "../escape"))).toBe("PATH_ESCAPE");
  });
});

describe("FsStore.writeArtifact / readArtifact", () => {
  it("writes a nested artifact, creating the directories it needs", async () => {
    const { store } = await tempStore();
    const dir = await store.openWorkDir("my-video");

    const artifact = await store.writeArtifact(dir, "raw/info.json", '{"id":"abc"}');

    expect(artifact).toEqual({ relPath: "raw/info.json", bytes: 12 });
    expect(await readFile(path.join(dir, "raw", "info.json"), "utf8")).toBe('{"id":"abc"}');
  });

  it("reads back exactly the bytes that were written", async () => {
    const { store } = await tempStore();
    const dir = await store.openWorkDir("my-video");
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);

    await store.writeArtifact(dir, "cover.png", bytes);

    expect(await store.readArtifact(dir, "cover.png")).toEqual(bytes);
  });

  it("answers null for an artifact that was never written", async () => {
    const { store } = await tempStore();
    const dir = await store.openWorkDir("my-video");

    expect(await store.readArtifact(dir, "transcript.md")).toBeNull();
  });

  it("refuses to write outside the package directory", async () => {
    const { store } = await tempStore();
    const dir = await store.openWorkDir("my-video");

    expect(await codeOf(() => store.writeArtifact(dir, "../../evil.md", "x"))).toBe("PATH_ESCAPE");
  });

  it("refuses to read outside the package directory", async () => {
    const { store } = await tempStore();
    const dir = await store.openWorkDir("my-video");

    expect(await codeOf(() => store.readArtifact(dir, "/etc/passwd"))).toBe("PATH_ESCAPE");
  });
});

describe("FsStore.saveRun / findRun", () => {
  it("persists the record inside its own package directory", async () => {
    const { store, dataDir } = await tempStore();

    await store.saveRun(record({ externalId: "abc", dirName: "my-video" }));

    const state = await readFile(path.join(dataDir, "my-video", "state.json"), "utf8");
    expect(JSON.parse(state)).toMatchObject({ schemaVersion: 1, externalId: "abc" });
  });

  it("finds a record it just saved", async () => {
    const { store } = await tempStore();
    const saved = record({ externalId: "abc", dirName: "my-video" });

    await store.saveRun(saved);

    expect(await store.findRun("abc")).toEqual(saved);
  });

  it("answers null for a video that was never run", async () => {
    const { store } = await tempStore();

    expect(await store.findRun("never-seen")).toBeNull();
  });

  it("updates in place rather than appending a second entry", async () => {
    const { store, dataDir } = await tempStore();
    await store.saveRun(record({ externalId: "abc", dirName: "my-video" }));

    await store.saveRun(
      record({ externalId: "abc", dirName: "my-video", updatedAt: "2026-02-02T00:00:00.000Z" }),
    );

    const index = JSON.parse(await readFile(path.join(dataDir, "index.json"), "utf8"));
    expect(index.runs).toHaveLength(1);
    expect(index.runs[0].updatedAt).toBe("2026-02-02T00:00:00.000Z");
  });

  it("refuses to save a record whose dirName escapes the data directory", async () => {
    const { store } = await tempStore();

    const code = await codeOf(() =>
      store.saveRun(record({ externalId: "abc", dirName: "../escape" })),
    );

    expect(code).toBe("PATH_ESCAPE");
  });
});

describe("FsStore.findRun self-heal", () => {
  it("recovers a package whose index entry was never written", async () => {
    const { store, dataDir } = await tempStore();
    const saved = record({ externalId: "abc", dirName: "my-video" });
    await plantPackage(dataDir, "my-video", saved);

    expect(await store.findRun("abc")).toEqual(saved);
  });

  it("writes the recovered entry back to the index", async () => {
    const { store, dataDir } = await tempStore();
    await plantPackage(dataDir, "my-video", record({ externalId: "abc", dirName: "my-video" }));

    await store.findRun("abc");

    const index = JSON.parse(await readFile(path.join(dataDir, "index.json"), "utf8"));
    expect(index.runs).toEqual([
      { externalId: "abc", dirName: "my-video", updatedAt: "2026-01-01T00:00:00.000Z" },
    ]);
  });

  it("recovers when the index points at a package that is gone", async () => {
    const { store, dataDir } = await tempStore();
    await writeFile(
      path.join(dataDir, "index.json"),
      JSON.stringify({
        schemaVersion: 1,
        runs: [{ externalId: "abc", dirName: "deleted-by-hand", updatedAt: "2026-01-01T00:00:00.000Z" }],
      }),
      "utf8",
    );
    const saved = record({ externalId: "abc", dirName: "my-video" });
    await plantPackage(dataDir, "my-video", saved);

    expect(await store.findRun("abc")).toEqual(saved);
  });

  it("recovers when the index itself is a torn write", async () => {
    const { store, dataDir } = await tempStore();
    await writeFile(path.join(dataDir, "index.json"), '{"runs": [{"externalId"', "utf8");
    const saved = record({ externalId: "abc", dirName: "my-video" });
    await plantPackage(dataDir, "my-video", saved);

    expect(await store.findRun("abc")).toEqual(saved);
  });

  it("skips a package whose state.json is corrupt", async () => {
    const { store, dataDir } = await tempStore();
    const dir = path.join(dataDir, "broken-video");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "state.json"), "{not json", "utf8");

    expect(await store.findRun("abc")).toBeNull();
  });

  it("skips a package whose state.json claims a hostile dirName", async () => {
    const { store, dataDir } = await tempStore();
    await plantPackage(dataDir, "my-video", {
      ...record({ externalId: "abc", dirName: "my-video" }),
      dirName: "../../../etc",
    });

    expect(await store.findRun("abc")).toBeNull();
  });

  it("ignores sibling directories that are not veta packages", async () => {
    // dataDir defaults to the working directory, so the scan runs over whatever
    // the user happens to have there. Anything without a state.json is not ours.
    const { store, dataDir } = await tempStore();
    await mkdir(path.join(dataDir, "node_modules"), { recursive: true });
    await mkdir(path.join(dataDir, ".git"), { recursive: true });
    await writeFile(path.join(dataDir, "README.md"), "# not a package", "utf8");
    const saved = record({ externalId: "abc", dirName: "my-video" });
    await plantPackage(dataDir, "my-video", saved);

    expect(await store.findRun("abc")).toEqual(saved);
  });

  it("does not descend below the top level", async () => {
    const { store, dataDir } = await tempStore();
    await plantPackage(
      dataDir,
      path.join("outer", "nested"),
      record({ externalId: "abc", dirName: "nested" }),
    );

    expect(await store.findRun("abc")).toBeNull();
  });
});

describe("FsStore.listRuns", () => {
  it("answers an empty list when nothing has been run", async () => {
    const { store } = await tempStore();

    expect(await store.listRuns()).toEqual([]);
  });

  it("returns one summary per package, most recently updated first", async () => {
    const { store } = await tempStore();
    await store.saveRun(
      record({ externalId: "old", dirName: "older-video", updatedAt: "2026-01-01T00:00:00.000Z" }),
    );
    await store.saveRun(
      record({ externalId: "new", dirName: "newer-video", updatedAt: "2026-03-03T00:00:00.000Z" }),
    );

    expect(await store.listRuns()).toEqual([
      { externalId: "new", dirName: "newer-video", updatedAt: "2026-03-03T00:00:00.000Z" },
      { externalId: "old", dirName: "older-video", updatedAt: "2026-01-01T00:00:00.000Z" },
    ]);
  });

  it("lists packages the index never knew about", async () => {
    const { store, dataDir } = await tempStore();
    await plantPackage(dataDir, "my-video", record({ externalId: "abc", dirName: "my-video" }));

    expect(await store.listRuns()).toEqual([
      { externalId: "abc", dirName: "my-video", updatedAt: "2026-01-01T00:00:00.000Z" },
    ]);
  });
});

describe("FsStore.rebuildIndex", () => {
  it("reports how many packages it recovered", async () => {
    const { store, dataDir } = await tempStore();
    await plantPackage(dataDir, "one", record({ externalId: "a", dirName: "one" }));
    await plantPackage(dataDir, "two", record({ externalId: "b", dirName: "two" }));
    await writeFile(path.join(dataDir, "loose-file.md"), "ignored", "utf8");

    expect(await store.rebuildIndex()).toEqual({ recovered: 2 });
  });

  it("replaces a stale index rather than merging into it", async () => {
    const { store, dataDir } = await tempStore();
    await store.saveRun(record({ externalId: "gone", dirName: "deleted-video" }));
    await rm(path.join(dataDir, "deleted-video"), { recursive: true });

    await store.rebuildIndex();

    const index = JSON.parse(await readFile(path.join(dataDir, "index.json"), "utf8"));
    expect(index.runs).toEqual([]);
  });

  it("reports zero on a data directory that does not exist yet", async () => {
    const dataDir = path.join(await mkdtemp(path.join(tmpdir(), "veta-store-")), "not-created");
    roots.push(path.dirname(dataDir));

    expect(await new FsStore({ dataDir }).rebuildIndex()).toEqual({ recovered: 0 });
  });
});

describe("FsStore.resetWorkDir", () => {
  async function packageWithEverything(store: FsStore): Promise<WorkDir> {
    const dir = await store.openWorkDir("my-video");
    await store.writeArtifact(dir, "raw/info.json", "{}");
    await store.writeArtifact(dir, "chapters/01-intro.md", "# Intro");
    await store.writeArtifact(dir, "transcript.md", "# Transcript");
    await store.writeArtifact(dir, "prompt.md", "# Prompt");
    await store.writeArtifact(dir, "metadata.json", "{}");
    await store.writeArtifact(dir, "cover.png", "png");
    await store.writeArtifact(dir, "transcript.md.partial", "torn");
    await writeFile(path.join(dir, "state.json"), "{}", "utf8");
    await writeFile(path.join(dir, "my-own-notes.md"), "hands off", "utf8");
    return dir;
  }

  it("removes every generated artifact", async () => {
    const { store } = await tempStore();
    const dir = await packageWithEverything(store);

    await store.resetWorkDir(dir);

    const left = await readdir(dir);
    expect(left).not.toContain("raw");
    expect(left).not.toContain("chapters");
    expect(left).not.toContain("transcript.md");
    expect(left).not.toContain("prompt.md");
    expect(left).not.toContain("metadata.json");
    expect(left).not.toContain("cover.png");
    expect(left).not.toContain("transcript.md.partial");
  });

  it("keeps the run state, or the reset would also erase what resume needs", async () => {
    const { store } = await tempStore();
    const dir = await packageWithEverything(store);

    await store.resetWorkDir(dir);

    expect(await readdir(dir)).toContain("state.json");
  });

  it("keeps a file veta did not create", async () => {
    const { store } = await tempStore();
    const dir = await packageWithEverything(store);

    await store.resetWorkDir(dir);

    expect(await readFile(path.join(dir, "my-own-notes.md"), "utf8")).toBe("hands off");
  });

  it("keeps the package directory itself", async () => {
    const { store, dataDir } = await tempStore();
    const dir = await packageWithEverything(store);

    await store.resetWorkDir(dir);

    expect(await readdir(dataDir)).toContain(path.basename(dir));
  });
});

describe("FsStore.purge", () => {
  it("removes every package directory and the index, and reports the count", async () => {
    const { store, dataDir } = await tempStore();
    await store.saveRun(record({ externalId: "a", dirName: "one" }));
    await store.saveRun(record({ externalId: "b", dirName: "two" }));

    const result = await store.purge();

    expect(result).toEqual({ removed: 2 });
    const left = await readdir(dataDir);
    expect(left).not.toContain("one");
    expect(left).not.toContain("two");
    expect(left).not.toContain("index.json");
  });

  it("leaves foreign entries in the data directory untouched", async () => {
    const { store, dataDir } = await tempStore();
    await store.saveRun(record({ externalId: "a", dirName: "my-video" }));
    await mkdir(path.join(dataDir, "no-state-here"), { recursive: true });
    await writeFile(path.join(dataDir, "loose-file.md"), "not ours", "utf8");
    await writeFile(path.join(dataDir, ".dotfile"), "not ours either", "utf8");

    const result = await store.purge();

    expect(result).toEqual({ removed: 1 });
    expect((await readdir(dataDir)).sort()).toEqual([".dotfile", "loose-file.md", "no-state-here"]);
  });

  it("removes a torn index write alongside the index itself", async () => {
    const { store, dataDir } = await tempStore();
    await store.saveRun(record({ externalId: "a", dirName: "my-video" }));
    await writeFile(path.join(dataDir, "index.json.partial"), '{"runs": [', "utf8");

    await store.purge();

    const left = await readdir(dataDir);
    expect(left).not.toContain("index.json");
    expect(left).not.toContain("index.json.partial");
  });

  it("reports zero on an empty data directory", async () => {
    const { store } = await tempStore();

    expect(await store.purge()).toEqual({ removed: 0 });
  });

  it("reports zero on a data directory that does not exist yet", async () => {
    const dataDir = path.join(await mkdtemp(path.join(tmpdir(), "veta-store-")), "not-created");
    roots.push(path.dirname(dataDir));

    expect(await new FsStore({ dataDir }).purge()).toEqual({ removed: 0 });
  });

  it("leaves nothing for listRuns to find", async () => {
    const { store } = await tempStore();
    await store.saveRun(record({ externalId: "a", dirName: "my-video" }));

    await store.purge();

    expect(await store.listRuns()).toEqual([]);
  });
});

describe("FsStore.replaceDir", () => {
  it("writes every file into the target directory", async () => {
    const { store } = await tempStore();
    const dir = await store.openWorkDir("my-video");

    await store.replaceDir(
      dir,
      "chapters",
      new Map([
        ["01-intro.md", "# Intro"],
        ["02-body.md", "# Body"],
      ]),
    );

    expect((await readdir(path.join(dir, "chapters"))).sort()).toEqual([
      "01-intro.md",
      "02-body.md",
    ]);
    expect(await readFile(path.join(dir, "chapters", "01-intro.md"), "utf8")).toBe("# Intro");
  });

  it("replaces the previous contents instead of merging with them", async () => {
    const { store } = await tempStore();
    const dir = await store.openWorkDir("my-video");
    await store.replaceDir(dir, "chapters", new Map([["stale.md", "from a previous run"]]));

    await store.replaceDir(dir, "chapters", new Map([["01-intro.md", "# Intro"]]));

    expect(await readdir(path.join(dir, "chapters"))).toEqual(["01-intro.md"]);
  });

  it("leaves no staging directory behind", async () => {
    const { store } = await tempStore();
    const dir = await store.openWorkDir("my-video");

    await store.replaceDir(dir, "chapters", new Map([["01-intro.md", "# Intro"]]));

    expect(await readdir(dir)).toEqual(["chapters"]);
  });

  it("refuses a target directory outside the package", async () => {
    const { store } = await tempStore();
    const dir = await store.openWorkDir("my-video");

    const code = await codeOf(() => store.replaceDir(dir, "../evil", new Map([["x.md", "x"]])));

    expect(code).toBe("PATH_ESCAPE");
  });

  it("refuses a file name that walks out of the target directory", async () => {
    const { store } = await tempStore();
    const dir = await store.openWorkDir("my-video");

    const code = await codeOf(() =>
      store.replaceDir(dir, "chapters", new Map([["../../evil.md", "x"]])),
    );

    expect(code).toBe("PATH_ESCAPE");
  });
});
