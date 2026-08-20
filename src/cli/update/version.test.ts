import { describe, expect, it } from "vitest";
import { isNewerVersion } from "./version.ts";

describe("isNewerVersion()", () => {
  it("is true when the minor is higher", () => {
    expect(isNewerVersion("0.11.0", "0.10.0")).toBe(true);
  });

  it("compares numerically, not lexically", () => {
    expect(isNewerVersion("0.10.0", "0.9.9")).toBe(true);
    expect(isNewerVersion("0.9.9", "0.10.0")).toBe(false);
  });

  it("is false for equal and older versions", () => {
    expect(isNewerVersion("0.10.0", "0.10.0")).toBe(false);
    expect(isNewerVersion("0.9.0", "0.10.0")).toBe(false);
    expect(isNewerVersion("1.0.0", "2.0.0")).toBe(false);
  });

  it("is true across major and patch bumps", () => {
    expect(isNewerVersion("1.0.0", "0.99.99")).toBe(true);
    expect(isNewerVersion("0.10.1", "0.10.0")).toBe(true);
  });

  it("tolerates a leading v", () => {
    expect(isNewerVersion("v0.11.0", "0.10.0")).toBe(true);
  });

  it("does not count a prerelease of the same core as newer than stable", () => {
    expect(isNewerVersion("0.10.0-beta.1", "0.10.0")).toBe(false);
    expect(isNewerVersion("0.11.0-beta.1", "0.10.0")).toBe(true);
  });

  it("is false for malformed input", () => {
    expect(isNewerVersion("latest", "0.10.0")).toBe(false);
    expect(isNewerVersion("0.11.0", "garbage")).toBe(false);
    expect(isNewerVersion("", "")).toBe(false);
  });
});
