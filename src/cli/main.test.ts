import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
