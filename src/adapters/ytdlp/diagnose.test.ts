import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { VetaError } from "../../domain/errors/veta-error.ts";
import { diagnose } from "./diagnose.ts";

describe("diagnose", () => {
  it.each([
    ["Unable to extract player response", "EXTRACTION_DRIFT"],
    ["Failed to extract nsig function", "EXTRACTION_DRIFT"],
    ["Sign in to confirm you're not a bot", "BOT_CHECK"],
    ["HTTP Error 429: Too Many Requests", "RATE_LIMITED"],
    ["Video unavailable", "VIDEO_UNAVAILABLE"],
    ["This is a private video", "VIDEO_UNAVAILABLE"],
    ["This video is members-only", "VIDEO_UNAVAILABLE"],
    ["Age-restricted content", "VIDEO_UNAVAILABLE"],
    ["Requested format is not available", "LANGUAGE_UNAVAILABLE"],
  ] as const)("maps %s to %s", (stderr, code) => {
    const error = diagnose(1, stderr);

    expect(error).toBeInstanceOf(VetaError);
    expect(error.code).toBe(code);
  });

  it("falls back to extraction drift and preserves a useful stderr snippet", () => {
    const error = diagnose(7, "An unknown upstream failure occurred");

    expect(error.code).toBe("EXTRACTION_DRIFT");
    expect(error.message).toContain("unknown upstream failure");
  });

  it("does not treat the substring 'age' inside unrelated words as VIDEO_UNAVAILABLE", () => {
    // "message" and "language" both contain the letters a-g-e.
    const error = diagnose(1, "ERROR: failed to download language message");

    expect(error.code).toBe("EXTRACTION_DRIFT");
  });

  it("rejects a successful exit as a programmer error", () => {
    const warning = readFileSync(new URL("./__fixtures__/stderr-success.txt", import.meta.url), "utf8");

    expect(() => diagnose(0, warning)).toThrow(/non-zero exit code/);
  });
});
