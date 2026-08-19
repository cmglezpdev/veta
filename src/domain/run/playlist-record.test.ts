import { describe, expect, it } from "vitest";
import { VetaError } from "../errors/veta-error.ts";
import {
  createPlaylistRecord,
  parsePlaylistRecord,
  PLAYLIST_STEP_ORDER,
  type PlaylistMemberRecord,
  type PlaylistRecord,
} from "./playlist-record.ts";

const MEMBERS: readonly PlaylistMemberRecord[] = [
  { position: 1, externalId: "abc12345678", dirName: "intro-to-layers", status: "extracted", errorCode: null },
  { position: 2, externalId: "def12345678", dirName: null, status: "unavailable", errorCode: "VIDEO_UNAVAILABLE" },
];

function freshPlaylist(overrides: Partial<PlaylistRecord> = {}): PlaylistRecord {
  return createPlaylistRecord({
    playlistId: "PLb0iCwbNjkuoY7Ix",
    dirName: "pl-clean-architecture-course-plb0icwbnjkuoy7ix",
    title: "Clean Architecture Course",
    totalCount: 2,
    members: MEMBERS,
    ...overrides,
  });
}

describe("createPlaylistRecord", () => {
  it("pins schemaVersion to 1 and kind to playlist", () => {
    const record = freshPlaylist();
    expect(record.schemaVersion).toBe(1);
    expect(record.kind).toBe("playlist");
  });

  it("initializes every playlist step as pending", () => {
    const record = freshPlaylist();
    for (const step of PLAYLIST_STEP_ORDER) {
      expect(record.steps[step]).toBe("pending");
    }
  });

  it("carries the resolved members through unchanged", () => {
    const record = freshPlaylist();
    expect(record.members).toEqual(MEMBERS);
    expect(record.totalCount).toBe(2);
  });
});

describe("PLAYLIST_STEP_ORDER", () => {
  it("lists members_resolved, members_extracted, prompt_generated in order", () => {
    expect(PLAYLIST_STEP_ORDER).toEqual(["members_resolved", "members_extracted", "prompt_generated"]);
  });
});

describe("parsePlaylistRecord", () => {
  it("round-trips a valid playlist record", () => {
    const original = freshPlaylist({
      steps: {
        members_resolved: "complete",
        members_extracted: "complete",
        prompt_generated: "skipped",
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });

    const parsed = parsePlaylistRecord(JSON.parse(JSON.stringify(original)));

    expect(parsed).toEqual(original);
  });

  it("rejects unknown schemaVersion", () => {
    const payload = { ...freshPlaylist(), schemaVersion: 99 };

    expect(() => parsePlaylistRecord(payload)).toThrow(VetaError);
    try {
      parsePlaylistRecord(payload);
    } catch (error) {
      expect((error as VetaError).code).toBe("PAYLOAD_SHAPE_CHANGED");
    }
  });

  it("rejects a payload whose kind is not playlist", () => {
    const payload = { ...freshPlaylist(), kind: "video" };

    expect(() => parsePlaylistRecord(payload)).toThrow(VetaError);
  });

  it("rejects a member with an unknown status", () => {
    const payload = {
      ...freshPlaylist(),
      members: [{ position: 1, externalId: "a", dirName: null, status: "bogus", errorCode: null }],
    };

    expect(() => parsePlaylistRecord(payload)).toThrow(VetaError);
  });
});
