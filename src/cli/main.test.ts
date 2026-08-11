import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRunRecord } from "../domain/run/run-record.ts";

const binPath = fileURLToPath(new URL("../../bin/cli.js", import.meta.url));

function runCli(args: readonly string[], env?: NodeJS.ProcessEnv) {
  return spawnSync("node", [binPath, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

describe("cli entrypoint", () => {
  it("exits non-zero with usage when given no arguments", () => {
    const result = runCli([]);

    expect(result.status).not.toBe(0);
    expect(result.stderr.length).toBeGreaterThan(0);
  });

  it("exits 0 for top-level --help and lists commands", () => {
    const result = runCli(["--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/extract/i);
    expect(result.stdout).toMatch(/completion/i);
    expect(result.stdout).toMatch(/doctor/i);
    expect(result.stdout).toMatch(/purge/i);
  });

  it("exits 0 for extract --help", () => {
    const result = runCli(["extract", "--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/extract/i);
  });

  it("exits 0 for completion and prints a zsh compdef script when SHELL is zsh", () => {
    // yargs picks the template from $SHELL / $ZSH_NAME — CI runners are bash.
    const result = runCli(["completion"], { SHELL: "/bin/zsh" });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("#compdef");
    expect(result.stdout).toContain("--get-yargs-completions");
  });

  it("exits 0 for completion and prints a bash script when SHELL is bash", () => {
    const result = runCli(["completion"], { SHELL: "/bin/bash", ZSH_NAME: "" });

    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain("#compdef");
    expect(result.stdout).toContain("--get-yargs-completions");
    expect(result.stdout).toMatch(/bashrc|bash_profile/i);
  });

  it("exits 2 for unrecognized input", () => {
    const result = runCli(["not-a-youtube-url"]);

    expect(result.status).toBe(2);
    expect(result.stderr.length).toBeGreaterThan(0);
  });

  it("exits 2 for unknown flags", () => {
    const result = runCli(["--totally-unknown-flag"]);

    expect(result.status).toBe(2);
    expect(result.stderr.length).toBeGreaterThan(0);
  });
});

describe("purge command", () => {
  let dataDir: string;
  let packageDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), "veta-cli-purge-"));
    packageDir = path.join(dataDir, "my-video");
    await mkdir(packageDir, { recursive: true });
    await writeFile(
      path.join(packageDir, "state.json"),
      JSON.stringify(
        createRunRecord({
          externalId: "abc",
          dirName: "my-video",
          selectedTrack: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
      ),
      "utf8",
    );
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it("deletes the stored package when the user answers y", () => {
    const result = spawnSync("node", [binPath, "purge"], {
      encoding: "utf8",
      input: "y\n",
      env: { ...process.env, VETA_DATA_DIR: dataDir },
    });

    expect(result.status).toBe(0);
    expect(existsSync(packageDir)).toBe(false);
  });

  it("leaves the stored package intact when the user just presses Enter", () => {
    const result = spawnSync("node", [binPath, "purge"], {
      encoding: "utf8",
      input: "",
      env: { ...process.env, VETA_DATA_DIR: dataDir },
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toContain("Aborted");
    expect(existsSync(packageDir)).toBe(true);
  });
});

describe("yargs completion short-circuit (D17)", () => {
  let fakeConfigDir: string;
  let fakeDataDir: string;

  beforeEach(async () => {
    fakeConfigDir = await mkdtemp(path.join(tmpdir(), "veta-cli-config-missing-"));
    fakeDataDir = await mkdtemp(path.join(tmpdir(), "veta-cli-data-missing-"));
    await rm(fakeConfigDir, { recursive: true, force: true });
    await rm(fakeDataDir, { recursive: true, force: true });
  });

  afterEach(async () => {
    await rm(fakeConfigDir, { recursive: true, force: true });
    await rm(fakeDataDir, { recursive: true, force: true });
  });

  it("completes without creating config or data dirs", () => {
    expect(existsSync(fakeConfigDir)).toBe(false);
    expect(existsSync(fakeDataDir)).toBe(false);

    const result = runCli(["--get-yargs-completions", "veta", "ex"], {
      VETA_CONFIG_DIR: fakeConfigDir,
      VETA_DATA_DIR: fakeDataDir,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("extract");
    expect(existsSync(fakeConfigDir)).toBe(false);
    expect(existsSync(fakeDataDir)).toBe(false);
  });
});
