import path from "node:path";
import { describe, expect, it } from "vitest";
import { isVetaError } from "../../domain/errors/veta-error.ts";
import { resolveWithin } from "./paths.ts";

const ROOT = path.resolve("/data/veta");

/** Written this way so the source file stays text — a literal NUL makes git treat it as binary. */
const NUL = String.fromCharCode(0);

function escapeCode(root: string, ...segments: string[]): string {
  try {
    resolveWithin(root, ...segments);
  } catch (error) {
    return isVetaError(error) ? error.code : `not-a-veta-error: ${String(error)}`;
  }
  return "no-throw";
}

describe("resolveWithin", () => {
  it("joins segments below the root", () => {
    expect(resolveWithin(ROOT, "my-video", "raw", "info.json")).toBe(
      path.join(ROOT, "my-video", "raw", "info.json"),
    );
  });

  it("returns the root itself when given no segments", () => {
    expect(resolveWithin(ROOT)).toBe(ROOT);
  });

  it("accepts a relative path expressed as one segment", () => {
    expect(resolveWithin(ROOT, "raw/info.json")).toBe(path.join(ROOT, "raw", "info.json"));
  });

  it("normalizes redundant separators and single dots", () => {
    expect(resolveWithin(ROOT, "./raw//info.json")).toBe(path.join(ROOT, "raw", "info.json"));
  });

  it("resolves a root given relatively, so the result is always absolute", () => {
    const resolved = resolveWithin("relative-root", "file.md");

    expect(path.isAbsolute(resolved)).toBe(true);
    expect(resolved).toBe(path.resolve("relative-root", "file.md"));
  });

  it("ignores a trailing separator on the root", () => {
    expect(resolveWithin(`${ROOT}${path.sep}`, "file.md")).toBe(path.join(ROOT, "file.md"));
  });

  // The four hazards from the slice-5 threat matrix.

  it("refuses a parent-directory segment", () => {
    expect(escapeCode(ROOT, "..")).toBe("PATH_ESCAPE");
  });

  it("refuses traversal buried inside an otherwise innocent path", () => {
    expect(escapeCode(ROOT, "raw/../../etc/passwd")).toBe("PATH_ESCAPE");
  });

  it("refuses traversal that lands back inside the root", () => {
    // Still refused: the caller had no business writing `..` at all, and
    // accepting it here would make the guard depend on arithmetic rather than
    // on a rule a reader can check.
    expect(escapeCode(ROOT, "raw/../transcript.md")).toBe("PATH_ESCAPE");
  });

  it("refuses an absolute segment", () => {
    expect(escapeCode(ROOT, "/etc/passwd")).toBe("PATH_ESCAPE");
  });

  it("refuses an absolute segment even when a safe segment precedes it", () => {
    expect(escapeCode(ROOT, "my-video", "/etc/passwd")).toBe("PATH_ESCAPE");
  });

  it("refuses a NUL byte, which truncates the path for the OS", () => {
    expect(escapeCode(ROOT, `transcript.md${NUL}.png`)).toBe("PATH_ESCAPE");
  });

  it("refuses an empty segment", () => {
    expect(escapeCode(ROOT, "")).toBe("PATH_ESCAPE");
  });

  // Names that merely look like traversal are ordinary names.

  it("accepts a dotfile-style name beginning with two dots", () => {
    expect(resolveWithin(ROOT, "..hidden.md")).toBe(path.join(ROOT, "..hidden.md"));
  });

  it("accepts a name containing two dots in the middle", () => {
    expect(resolveWithin(ROOT, "part..two.md")).toBe(path.join(ROOT, "part..two.md"));
  });

  it("names the offending segment in the error message", () => {
    expect(() => resolveWithin(ROOT, "raw", "../../escape")).toThrow(/\.\.\/\.\.\/escape/);
  });
});
