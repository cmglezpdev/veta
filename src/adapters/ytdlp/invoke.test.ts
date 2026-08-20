import { chmod, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { invokeYtDlp } from "./invoke.ts";

const tempDirs: string[] = [];

async function script(body: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "veta-invoke-"));
  tempDirs.push(dir);
  const file = path.join(dir, "yt-dlp");
  await writeFile(file, `#!/bin/sh\n${body}\n`, "utf8");
  await chmod(file, 0o755);
  return file;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

describe("invokeYtDlp", () => {
  it("always places --ignore-config before caller arguments", async () => {
    const binary = await script("printf '%s\\n' \"$@\"");

    const result = await invokeYtDlp(binary, ["--version", "video"]);

    expect(result).toEqual({
      stdout: "--ignore-config\n--version\nvideo\n",
      stderr: "",
      code: 0,
    });
  });

  it("keeps warning stderr from a successful process", async () => {
    const warning = await readFile(
      new URL("./__fixtures__/stderr-success.txt", import.meta.url),
      "utf8",
    );
    const binary = await script(`printf '%s' '${warning.replaceAll("'", "'\\''")}' >&2\nexit 0`);

    const result = await invokeYtDlp(binary, []);

    expect(result.code).toBe(0);
    expect(result.stderr).toContain("WARNING:");
  });

  it("classifies a non-zero process through diagnose", async () => {
    const binary = await script("printf '%s\\n' \"Sign in to confirm you're not a bot\" >&2\nexit 3");

    await expect(invokeYtDlp(binary, ["video"])).rejects.toMatchObject({ code: "BOT_CHECK" });
  });

  it("maps a missing executable to YTDLP_NOT_FOUND", async () => {
    await expect(
      invokeYtDlp(path.join(tmpdir(), "missing-veta-ytdlp"), []),
    ).rejects.toMatchObject({
      code: "YTDLP_NOT_FOUND",
    });
  });

  it("runs in the requested working directory", async () => {
    const binary = await script("pwd");
    const cwd = await mkdtemp(path.join(tmpdir(), "veta-cwd-"));
    tempDirs.push(cwd);

    const result = await invokeYtDlp(binary, [], { cwd });

    expect(await realpath(result.stdout.trim())).toBe(await realpath(cwd));
  });

  it("honours an explicit maxBuffer for stdout larger than the 1 MiB default", async () => {
    // execFile's default maxBuffer is 1 MiB; a playlist listing can exceed
    // that (D4 / smoke test #3645). Without the explicit override below,
    // this would reject with ENOBUFS instead of resolving.
    const binary = await script("head -c 1500000 /dev/zero | tr '\\0' 'a'");

    const result = await invokeYtDlp(binary, [], { maxBuffer: 4 * 1024 * 1024 });

    expect(result.stdout.length).toBe(1500000);
  });
});
