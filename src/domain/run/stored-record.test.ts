import { describe, expect, it } from "vitest";
import { VetaError } from "../errors/veta-error.ts";
import { createPlaylistRecord } from "./playlist-record.ts";
import { createRunRecord } from "./run-record.ts";
import { isPlaylistRecord, parseStoredRecord } from "./stored-record.ts";

describe("parseStoredRecord", () => {
  it("dispatches to the playlist parser when kind is playlist", () => {
    const original = createPlaylistRecord({
      playlistId: "PLb0iCwbNjkuoY7Ix",
      dirName: "pl-clean-architecture-course-plb0icwbnjkuoy7ix",
      title: "Clean Architecture Course",
      totalCount: 1,
      members: [
        { position: 1, externalId: "abc12345678", dirName: "intro", status: "extracted", errorCode: null },
      ],
    });

    const parsed = parseStoredRecord(JSON.parse(JSON.stringify(original)));

    expect(parsed).toEqual(original);
  });

  it("dispatches to the run parser when kind is absent (v1 video record)", () => {
    const original = createRunRecord({
      externalId: "abc12345678",
      dirName: "sample-video",
      selectedTrack: null,
    });

    const parsed = parseStoredRecord(JSON.parse(JSON.stringify(original)));

    expect(parsed).toEqual(original);
  });

  it("throws PAYLOAD_SHAPE_CHANGED for a non-object payload", () => {
    expect(() => parseStoredRecord("not-an-object")).toThrow(VetaError);
    try {
      parseStoredRecord("not-an-object");
    } catch (error) {
      expect((error as VetaError).code).toBe("PAYLOAD_SHAPE_CHANGED");
    }
  });
});

describe("isPlaylistRecord", () => {
  it("is true for a playlist record", () => {
    const playlist = createPlaylistRecord({
      playlistId: "PLb0iCwbNjkuoY7Ix",
      dirName: "pl-clean-architecture-course-plb0icwbnjkuoy7ix",
      title: "Clean Architecture Course",
      totalCount: 0,
      members: [],
    });

    expect(isPlaylistRecord(playlist)).toBe(true);
  });

  it("is false for a video run record", () => {
    const run = createRunRecord({
      externalId: "abc12345678",
      dirName: "sample-video",
      selectedTrack: null,
    });

    expect(isPlaylistRecord(run)).toBe(false);
  });
});
