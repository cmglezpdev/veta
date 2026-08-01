import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const binPath = fileURLToPath(new URL("../../bin/cli.js", import.meta.url));

describe("cli entrypoint", () => {
  it("exits non-zero with usage when given no arguments", () => {
    const result = spawnSync("node", [binPath], { encoding: "utf8" });

    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/usage/i);
  });

  it("exits 2 for unrecognized input", () => {
    const result = spawnSync("node", [binPath, "not-a-youtube-url"], { encoding: "utf8" });

    expect(result.status).toBe(2);
    expect(result.stderr.length).toBeGreaterThan(0);
  });
});
