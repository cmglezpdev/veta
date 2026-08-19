import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FsStore } from "../adapters/store/fs-store.ts";
import { createPlaylistRecord } from "../domain/run/playlist-record.ts";
import type { PlaylistMemberRecord } from "../domain/run/playlist-record.ts";
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

function member(position: number, dirName: string | null, status: PlaylistMemberRecord["status"]): PlaylistMemberRecord {
  return { position, externalId: `ext${position}`, dirName, status, errorCode: null };
}

async function plantPlaylist(
  playlistId: string,
  dirName: string,
  updatedAt: string,
  members: readonly PlaylistMemberRecord[],
): Promise<void> {
  await newStore().savePlaylist(
    createPlaylistRecord({ playlistId, dirName, title: dirName, totalCount: members.length, members, updatedAt }),
  );
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

  it("groups a playlist row first, followed by its member rows", async () => {
    await plantRun({
      externalId: "m1",
      dirName: "member-one",
      updatedAt: "2026-01-01T00:00:00.000Z",
      steps: ALL_COMPLETE,
    });
    await plantRun({
      externalId: "m2",
      dirName: "member-two",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    await plantPlaylist("PL1", "pl-my-playlist-pl1", "2026-02-02T00:00:00.000Z", [
      member(1, "member-one", "extracted"),
      member(2, "member-two", "extracted"),
    ]);

    const { lines, count } = await collectLines();

    expect(count).toBe(3);
    expect(lines[0]).toContain("pl-my-playlist-pl1");
    expect(lines[0]).toContain("playlist:");
    expect(lines[1]).toContain("member-one");
    expect(lines[2]).toContain("member-two");
  });

  it("shows a failed or unavailable member without a dirName by position and status", async () => {
    await plantPlaylist("PL2", "pl-broken-pl2", "2026-01-01T00:00:00.000Z", [
      member(1, null, "unavailable"),
    ]);

    const { lines } = await collectLines();

    expect(lines[1]).toContain("#1");
    expect(lines[1]).toContain("unavailable");
  });

  it("lists a member only once even when it belongs to two playlists", async () => {
    await plantRun({
      externalId: "shared",
      dirName: "shared-video",
      updatedAt: "2026-01-01T00:00:00.000Z",
      steps: ALL_COMPLETE,
    });
    await plantPlaylist("PL3", "pl-first-pl3", "2026-03-01T00:00:00.000Z", [member(1, "shared-video", "extracted")]);
    await plantPlaylist("PL4", "pl-second-pl4", "2026-02-01T00:00:00.000Z", [member(1, "shared-video", "extracted")]);

    const { lines, count } = await collectLines();

    expect(count).toBe(3); // 2 playlist rows + 1 shared member row, never twice
    expect(lines.filter((line) => line.includes("shared-video"))).toHaveLength(1);
  });
});
