import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FsStore } from "../adapters/store/fs-store.ts";
import { createRunRecord } from "../domain/run/run-record.ts";
import { purge } from "./purge.ts";

let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "veta-purge-"));
});

afterEach(async () => {
  await rm(dataDir, { force: true, recursive: true });
});

function newStore(): FsStore {
  return new FsStore({ dataDir });
}

/** Plant a package on disk the way a previous run would have left it. */
async function plantPackage(dirName: string, externalId: string): Promise<string> {
  const dir = path.join(dataDir, dirName);
  const state = createRunRecord({
    externalId,
    dirName,
    selectedTrack: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "state.json"), JSON.stringify(state), "utf8");
  return dir;
}

async function runPurge(answer: string | null): Promise<{
  result: { confirmed: boolean; removed: number };
  written: string;
}> {
  const input = new PassThrough();
  const output = new PassThrough();

  const pending = purge(newStore(), input, output);
  if (answer === null) input.end();
  else input.end(`${answer}\n`);
  const result = await pending;

  return { result, written: output.read()?.toString("utf8") ?? "" };
}

describe("purge", () => {
  it("asks before deleting, with No as the default", async () => {
    const { written } = await runPurge("");

    expect(written).toContain("Permanently delete all stored extraction data?");
    expect(written).toContain("[y/N]");
  });

  it("declines on an empty line, leaving the package on disk", async () => {
    const dir = await plantPackage("my-video", "abc");

    const { result, written } = await runPurge("");

    expect(result).toEqual({ confirmed: false, removed: 0 });
    expect(written).toContain("Aborted. Nothing was deleted.");
    expect(existsSync(dir)).toBe(true);
  });

  it("declines on n, leaving the package on disk", async () => {
    const dir = await plantPackage("my-video", "abc");

    const { result } = await runPurge("n");

    expect(result).toEqual({ confirmed: false, removed: 0 });
    expect(existsSync(dir)).toBe(true);
  });

  it("declines when the input closes without a line", async () => {
    const dir = await plantPackage("my-video", "abc");

    const { result } = await runPurge(null);

    expect(result).toEqual({ confirmed: false, removed: 0 });
    expect(existsSync(dir)).toBe(true);
  });

  it("deletes on y and reports the count", async () => {
    const one = await plantPackage("one", "a");
    const two = await plantPackage("two", "b");

    const { result, written } = await runPurge("y");

    expect(result).toEqual({ confirmed: true, removed: 2 });
    expect(written).toContain("Removed 2 package(s) from the data directory.");
    expect(existsSync(one)).toBe(false);
    expect(existsSync(two)).toBe(false);
  });

  it("deletes on yes", async () => {
    const dir = await plantPackage("my-video", "abc");

    const { result } = await runPurge("yes");

    expect(result).toEqual({ confirmed: true, removed: 1 });
    expect(existsSync(dir)).toBe(false);
  });
});
