import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isVetaError } from "../../domain/errors/veta-error.ts";
import { createRunRecord, parseRunRecord } from "../../domain/run/run-record.ts";
import { FsStore } from "./fs-store.ts";

/**
 * What veta writes today, veta must still read tomorrow.
 *
 * These tests pin the on-disk shape of `state.json` and `index.json`. A field
 * renamed or dropped in the domain breaks them here rather than in a user's
 * data directory six months from now.
 */

const roots: string[] = [];

async function tempStore(): Promise<{ store: FsStore; dataDir: string }> {
  const dataDir = await mkdtemp(path.join(tmpdir(), "veta-schema-"));
  roots.push(dataDir);
  return { store: new FsStore({ dataDir }), dataDir };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

const SAVED = createRunRecord({
  externalId: "dQw4w9WgXcQ",
  dirName: "never-gonna-give-you-up",
  selectedTrack: "en",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  steps: { metadata_fetched: "complete", thumbnail_downloaded: "skipped" },
});

describe("state.json", () => {
  it("round-trips through the domain parser", async () => {
    const { store, dataDir } = await tempStore();

    await store.saveRun(SAVED);

    const raw = JSON.parse(
      await readFile(path.join(dataDir, "never-gonna-give-you-up", "state.json"), "utf8"),
    );
    expect(parseRunRecord(raw)).toEqual(SAVED);
  });

  it("is written with the v1 field set, exactly", async () => {
    const { store, dataDir } = await tempStore();

    await store.saveRun(SAVED);

    const raw = JSON.parse(
      await readFile(path.join(dataDir, "never-gonna-give-you-up", "state.json"), "utf8"),
    );
    expect(raw).toEqual({
      schemaVersion: 1,
      externalId: "dQw4w9WgXcQ",
      dirName: "never-gonna-give-you-up",
      selectedTrack: "en",
      steps: {
        metadata_fetched: "complete",
        thumbnail_downloaded: "skipped",
        captions_downloaded: "pending",
        transcript_normalized: "pending",
        prompt_generated: "pending",
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
  });

  it("refuses a state file written by a newer veta", async () => {
    // The index says this run exists, so staying quiet would be a lie. Migration
    // ships with schemaVersion 2; until then, refusing names the file.
    const { store, dataDir } = await tempStore();
    await store.saveRun(SAVED);
    const file = path.join(dataDir, "never-gonna-give-you-up", "state.json");
    await writeFile(file, JSON.stringify({ ...SAVED, schemaVersion: 2 }), "utf8");

    let code = "no-throw";
    try {
      await store.findRun("dQw4w9WgXcQ");
    } catch (error) {
      code = isVetaError(error) ? error.code : `not-a-veta-error: ${String(error)}`;
    }

    expect(code).toBe("PAYLOAD_SHAPE_CHANGED");
  });
});

describe("index.json", () => {
  it("is written with the v1 field set, exactly", async () => {
    const { store, dataDir } = await tempStore();

    await store.saveRun(SAVED);

    expect(JSON.parse(await readFile(path.join(dataDir, "index.json"), "utf8"))).toEqual({
      schemaVersion: 1,
      runs: [
        {
          externalId: "dQw4w9WgXcQ",
          dirName: "never-gonna-give-you-up",
          updatedAt: "2026-01-02T00:00:00.000Z",
        },
      ],
    });
  });

  it("is rebuilt, not refused, when written by a newer veta", async () => {
    // Unlike state.json, the index holds nothing that cannot be derived from the
    // packages on disk. Refusing would strand a user on a version downgrade.
    const { store, dataDir } = await tempStore();
    const dir = path.join(dataDir, "never-gonna-give-you-up");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "state.json"), JSON.stringify(SAVED), "utf8");
    await writeFile(
      path.join(dataDir, "index.json"),
      JSON.stringify({ schemaVersion: 2, entries: [] }),
      "utf8",
    );

    expect(await store.findRun("dQw4w9WgXcQ")).toEqual(SAVED);
  });
});
