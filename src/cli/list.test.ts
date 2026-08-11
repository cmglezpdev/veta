import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FsStore } from "../adapters/store/fs-store.ts";
import { createRunRecord } from "../domain/run/run-record.ts";
import type { CreateRunRecordInput } from "../domain/run/run-record.ts";
import { list } from "./list.ts";

let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "veta-list-"));
});

afterEach(async () => {
  await rm(dataDir, { force: true, recursive: true });
});

function newStore(): FsStore {
  return new FsStore({ dataDir });
}

async function plantRun(input: Omit<CreateRunRecordInput, "selectedTrack">): Promise<void> {
  await newStore().saveRun(createRunRecord({ selectedTrack: null, ...input }));
}

const ALL_COMPLETE = {
  metadata_fetched: "complete",
  thumbnail_downloaded: "complete",
  captions_downloaded: "complete",
  transcript_normalized: "complete",
  prompt_generated: "complete",
} as const;

async function collectLines(): Promise<{ lines: string[]; count: number }> {
  const output = new PassThrough();
  const { count } = await list(newStore(), output);
  output.end();

  const text = (output.read() as Buffer | null)?.toString("utf8") ?? "";
  return { lines: text === "" ? [] : text.split("\n"), count };
}

describe("list", () => {
  it("writes nothing and counts zero when no runs are stored", async () => {
    const { lines, count } = await collectLines();

    expect(lines).toEqual([]);
    expect(count).toBe(0);
  });

  it("prints one line per run, most recently updated first", async () => {
    await plantRun({
      externalId: "old",
      dirName: "older-video",
      updatedAt: "2026-01-01T00:00:00.000Z",
      steps: ALL_COMPLETE,
    });
    await plantRun({
      externalId: "new",
      dirName: "newer-video",
      updatedAt: "2026-03-03T00:00:00.000Z",
      steps: ALL_COMPLETE,
    });

    const { lines, count } = await collectLines();

    expect(count).toBe(2);
    expect(lines).toEqual([
      "newer-video  2026-03-03T00:00:00.000Z  complete",
      "older-video  2026-01-01T00:00:00.000Z  complete",
      "",
    ]);
  });

  it("names the first pending step for an unfinished run", async () => {
    await plantRun({
      externalId: "abc",
      dirName: "my-video",
      updatedAt: "2026-01-01T00:00:00.000Z",
      steps: { metadata_fetched: "complete", thumbnail_downloaded: "skipped" },
    });

    const { lines } = await collectLines();

    expect(lines).toEqual([
      "my-video  2026-01-01T00:00:00.000Z  incomplete: captions_downloaded",
      "",
    ]);
  });

  it("pads shorter directory names so the columns line up", async () => {
    await plantRun({
      externalId: "short",
      dirName: "short",
      updatedAt: "2026-02-02T00:00:00.000Z",
      steps: ALL_COMPLETE,
    });
    await plantRun({
      externalId: "long",
      dirName: "a-much-longer-video-name",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const { lines } = await collectLines();

    expect(lines).toEqual([
      "short                     2026-02-02T00:00:00.000Z  complete",
      "a-much-longer-video-name  2026-01-01T00:00:00.000Z  incomplete: metadata_fetched",
      "",
    ]);
  });
});
