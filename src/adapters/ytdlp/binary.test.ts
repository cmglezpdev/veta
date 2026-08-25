import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resetBinaryCache, resolveYtDlpBinary } from "./binary.ts";

const tempDirs: string[] = [];

async function fakeBinary(version: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "veta-ytdlp-"));
  tempDirs.push(dir);
  const binary = path.join(dir, "yt-dlp");
  await writeFile(binary, `#!/bin/sh\nprintf '%s\\n' '${version}'\n`, "utf8");
  await chmod(binary, 0o755);
  return binary;
}

afterEach(async () => {
  resetBinaryCache();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

describe("resolveYtDlpBinary", () => {
  it("resolves a real executable from VETA_YTDLP_PATH", async () => {
    const binary = await fakeBinary("2026.07.31");

    await expect(
      resolveYtDlpBinary({ env: { VETA_YTDLP_PATH: binary, PATH: "" } }),
    ).resolves.toEqual({
      path: binary,
      source: "config",
      version: "2026.07.31",
    });
  });

  it("prefers an explicit path over the environment", async () => {
    const configured = await fakeBinary("configured");
    const explicit = await fakeBinary("explicit");

    const resolved = await resolveYtDlpBinary({
      explicitPath: explicit,
      env: { VETA_YTDLP_PATH: configured, PATH: "" },
    });

    expect(resolved).toMatchObject({ path: explicit, source: "config", version: "explicit" });
  });

  it("falls back to yt-dlp on PATH when nothing is configured", async () => {
    const binary = await fakeBinary("from-path");

    await expect(
      resolveYtDlpBinary({ env: { PATH: path.dirname(binary) } }),
    ).resolves.toMatchObject({ source: "path", version: "from-path" });
  });

  it("falls back to PATH when the configured path is not usable", async () => {
    const binary = await fakeBinary("from-path");

    await expect(
      resolveYtDlpBinary({
        explicitPath: path.join(tmpdir(), "definitely-missing-veta-ytdlp"),
        env: { PATH: path.dirname(binary) },
      }),
    ).resolves.toMatchObject({ source: "path", version: "from-path" });
  });

  it("caches the first successful resolution for the process", async () => {
    const first = await fakeBinary("first");
    const second = await fakeBinary("second");

    const initial = await resolveYtDlpBinary({ explicitPath: first, env: { PATH: "" } });
    const cached = await resolveYtDlpBinary({ explicitPath: second, env: { PATH: "" } });

    expect(initial.version).toBe("first");
    expect(cached).toEqual(initial);
  });

  it("reports actionable installation help when no binary exists", async () => {
    await expect(
      resolveYtDlpBinary({
        explicitPath: path.join(tmpdir(), "definitely-missing-veta-ytdlp"),
        env: { PATH: "" },
      }),
    ).rejects.toMatchObject({
      code: "YTDLP_NOT_FOUND",
      message: expect.stringMatching(/brew install yt-dlp.*VETA_YTDLP_PATH/is),
    });
  });
});
