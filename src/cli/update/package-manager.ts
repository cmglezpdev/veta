import { realpath } from "node:fs/promises";

/**
 * Which tool put veta on this machine, guessed from where the binary lives.
 *
 * The update notice tells the user what to run, and telling a pnpm user to
 * `npm install -g` would leave them with two copies and the wrong one on
 * PATH. The guess is a heuristic over the resolved bin path plus npm's user
 * agent; it is allowed to be wrong, so npm stays the default.
 */
export type Installer = "npm" | "pnpm" | "yarn" | "bun" | "npx" | "brew";

const PACKAGE = "@cmglezpdev/veta@latest";

const UPDATE_COMMANDS: Record<Installer, string> = {
  npm: `npm install -g ${PACKAGE}`,
  pnpm: `pnpm add -g ${PACKAGE}`,
  yarn: `yarn global add ${PACKAGE}`,
  bun: `bun add -g ${PACKAGE}`,
  npx: `npx ${PACKAGE}`,
  brew: "brew upgrade veta",
};

export function updateCommandFor(installer: Installer): string {
  return UPDATE_COMMANDS[installer];
}

/**
 * Detect the installer from the (realpath-resolved) bin path and environment.
 *
 * Checks run in priority order because paths overlap: an `npx` cache can sit
 * inside pnpm's store, and homebrew's `lib/node_modules` contains no
 * package-manager name at all.
 */
export function detectInstaller(binPath: string, env: NodeJS.ProcessEnv = {}): Installer {
  const p = binPath.replaceAll("\\", "/").toLowerCase();
  const agent = (env["npm_config_user_agent"] ?? "").toLowerCase();

  if (p.includes("/_npx/") || agent.includes("npx")) {
    return "npx";
  }
  if (
    p.includes("/pnpm/") ||
    p.includes("/.pnpm/") ||
    p.includes("/library/pnpm/") ||
    agent.startsWith("pnpm")
  ) {
    return "pnpm";
  }
  if (p.includes("/.yarn/") || p.includes("/yarn/") || agent.startsWith("yarn")) {
    return "yarn";
  }
  if (p.includes("/.bun/") || agent.startsWith("bun")) {
    return "bun";
  }
  if (p.includes("/cellar/") || p.includes("/homebrew/") || p.includes("/linuxbrew/")) {
    return "brew";
  }
  return "npm";
}

/** The running binary's real location — symlinks resolved so `/pnpm/` and friends show through. */
export async function currentBinPath(): Promise<string> {
  const raw = process.argv[1] ?? "";
  try {
    return await realpath(raw);
  } catch {
    return raw;
  }
}
