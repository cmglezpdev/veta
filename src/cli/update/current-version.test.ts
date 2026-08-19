import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { readCurrentVersion } from "./current-version.ts";

describe("readCurrentVersion()", () => {
  it("matches the version in package.json", async () => {
    const pkg = JSON.parse(
      await readFile(new URL("../../../package.json", import.meta.url), "utf8"),
    ) as { version: string };

    await expect(readCurrentVersion()).resolves.toBe(pkg.version);
  });
});
