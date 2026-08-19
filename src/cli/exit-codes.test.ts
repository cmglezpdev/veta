import { describe, expect, it } from "vitest";
import type { VetaErrorCode } from "../domain/errors/veta-error.ts";
import { VetaError } from "../domain/errors/veta-error.ts";
import { EXIT_CODES, exitCodeFor } from "./exit-codes.ts";

const ALL_CODES: readonly VetaErrorCode[] = [
  "YTDLP_NOT_FOUND",
  "EXTRACTION_DRIFT",
  "BOT_CHECK",
  "RATE_LIMITED",
  "VIDEO_UNAVAILABLE",
  "NO_CAPTIONS",
  "LANGUAGE_UNAVAILABLE",
  "PAYLOAD_SHAPE_CHANGED",
  "ROOT_OVERLAP",
  "PATH_ESCAPE",
  "WORK_DIR_EXISTS",
  "INPUT_UNRECOGNIZED",
  "PLAYLIST_EMPTY",
  "PLAYLIST_PARTIAL_FAILURE",
];

describe("exitCodeFor", () => {
  it("maps every VetaErrorCode", () => {
    expect(Object.keys(EXIT_CODES).sort()).toEqual([...ALL_CODES].sort());
  });

  it.each(ALL_CODES)("maps %s to a non-zero exit code", (code) => {
    expect(exitCodeFor(new VetaError(code, "test"))).not.toBe(0);
  });

  it("maps INPUT_UNRECOGNIZED to usage error 2", () => {
    expect(exitCodeFor(new VetaError("INPUT_UNRECOGNIZED", "bad input"))).toBe(2);
  });

  it("maps NO_CAPTIONS to 3", () => {
    expect(exitCodeFor(new VetaError("NO_CAPTIONS", "none"))).toBe(3);
  });

  it("maps LANGUAGE_UNAVAILABLE to 4", () => {
    expect(exitCodeFor(new VetaError("LANGUAGE_UNAVAILABLE", "missing"))).toBe(4);
  });

  it("maps YTDLP_NOT_FOUND and EXTRACTION_DRIFT to 5", () => {
    expect(exitCodeFor(new VetaError("YTDLP_NOT_FOUND", "missing"))).toBe(5);
    expect(exitCodeFor(new VetaError("EXTRACTION_DRIFT", "drift"))).toBe(5);
    expect(exitCodeFor(new VetaError("PAYLOAD_SHAPE_CHANGED", "shape"))).toBe(5);
  });

  it("maps VIDEO_UNAVAILABLE to 6", () => {
    expect(exitCodeFor(new VetaError("VIDEO_UNAVAILABLE", "gone"))).toBe(6);
  });

  it("maps BOT_CHECK and RATE_LIMITED to 7", () => {
    expect(exitCodeFor(new VetaError("BOT_CHECK", "bot"))).toBe(7);
    expect(exitCodeFor(new VetaError("RATE_LIMITED", "slow"))).toBe(7);
  });

  it("maps the filesystem refusals to 8", () => {
    expect(exitCodeFor(new VetaError("ROOT_OVERLAP", "overlap"))).toBe(8);
    expect(exitCodeFor(new VetaError("PATH_ESCAPE", "escape"))).toBe(8);
    expect(exitCodeFor(new VetaError("WORK_DIR_EXISTS", "taken"))).toBe(8);
  });

  it("maps unknown errors to 1", () => {
    expect(exitCodeFor(new Error("boom"))).toBe(1);
    expect(exitCodeFor("string")).toBe(1);
  });

  it("maps PLAYLIST_EMPTY to 6", () => {
    expect(exitCodeFor(new VetaError("PLAYLIST_EMPTY", "empty"))).toBe(6);
  });

  it("maps PLAYLIST_PARTIAL_FAILURE to 9", () => {
    expect(exitCodeFor(new VetaError("PLAYLIST_PARTIAL_FAILURE", "partial"))).toBe(9);
  });
});
