import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const binPath = fileURLToPath(new URL("../../bin/cli.js", import.meta.url));

describe("cli entrypoint", () => {
  it("exits 0", () => {
    const result = spawnSync("node", [binPath], { encoding: "utf8" });
    expect(result.status).toBe(0);
  });
});
