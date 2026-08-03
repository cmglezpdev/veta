import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readJsonFile, writeJsonAtomic } from "./atomic-json.ts";

const roots: string[] = [];

async function tempRoot(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "veta-atomic-"));
  roots.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

describe("writeJsonAtomic", () => {
  it("writes a payload that reads back as the same value", async () => {
    const root = await tempRoot();
    const file = path.join(root, "state.json");

    await writeJsonAtomic(file, { schemaVersion: 1, externalId: "abc" });

    expect(await readJsonFile(file)).toEqual({ schemaVersion: 1, externalId: "abc" });
  });

  it("leaves the file human-readable, one entry per line", async () => {
    const root = await tempRoot();
    const file = path.join(root, "state.json");

    await writeJsonAtomic(file, { a: 1, b: 2 });

    const text = await readFile(file, "utf8");
    expect(text).toBe('{\n  "a": 1,\n  "b": 2\n}\n');
  });

  it("leaves no partial file behind on success", async () => {
    const root = await tempRoot();

    await writeJsonAtomic(path.join(root, "state.json"), { ok: true });

    expect(await readdir(root)).toEqual(["state.json"]);
  });

  it("replaces the previous content completely, never merging into it", async () => {
    const root = await tempRoot();
    const file = path.join(root, "index.json");
    await writeJsonAtomic(file, { runs: [{ externalId: "old" }, { externalId: "older" }] });

    await writeJsonAtomic(file, { runs: [{ externalId: "new" }] });

    expect(await readJsonFile(file)).toEqual({ runs: [{ externalId: "new" }] });
  });

  it("keeps the previous file intact when the payload cannot be serialized", async () => {
    const root = await tempRoot();
    const file = path.join(root, "state.json");
    await writeJsonAtomic(file, { keep: "me" });
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    await expect(writeJsonAtomic(file, circular)).rejects.toThrow();

    expect(await readJsonFile(file)).toEqual({ keep: "me" });
  });

  it("leaves no partial file behind when the payload cannot be serialized", async () => {
    const root = await tempRoot();
    const file = path.join(root, "state.json");
    await writeJsonAtomic(file, { keep: "me" });
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    await expect(writeJsonAtomic(file, circular)).rejects.toThrow();

    expect(await readdir(root)).toEqual(["state.json"]);
  });

  it("clears a partial left by an earlier interrupted write", async () => {
    const root = await tempRoot();
    const file = path.join(root, "state.json");
    await writeFile(`${file}.partial`, '{"torn": ', "utf8");

    await writeJsonAtomic(file, { ok: true });

    expect(await readdir(root)).toEqual(["state.json"]);
  });
});

describe("readJsonFile", () => {
  it("returns null when the file does not exist", async () => {
    const root = await tempRoot();

    expect(await readJsonFile(path.join(root, "missing.json"))).toBeNull();
  });

  it("returns null for a torn write rather than throwing", async () => {
    // A half-written index.json must read as absent so the store can rebuild it
    // from the packages on disk. Shape validation is a separate concern and
    // belongs to the domain parser.
    const root = await tempRoot();
    const file = path.join(root, "index.json");
    await writeFile(file, '{"runs": [{"externalId": "abc"', "utf8");

    expect(await readJsonFile(file)).toBeNull();
  });

  it("returns null for an empty file", async () => {
    const root = await tempRoot();
    const file = path.join(root, "index.json");
    await writeFile(file, "", "utf8");

    expect(await readJsonFile(file)).toBeNull();
  });

  it("returns null when the path is a directory", async () => {
    const root = await tempRoot();

    expect(await readJsonFile(root)).toBeNull();
  });

  it("reads back a payload written by hand", async () => {
    const root = await tempRoot();
    const file = path.join(root, "state.json");
    await writeFile(file, '{"externalId": "hand-written"}', "utf8");

    expect(await readJsonFile(file)).toEqual({ externalId: "hand-written" });
  });
});
