import { mkdir } from "node:fs/promises";
import path from "node:path";
import { readJsonFile, writeJsonAtomic } from "../../adapters/store/atomic-json.ts";
import { isRecord } from "../../domain/json.ts";
import { isNewerVersion } from "./version.ts";

/**
 * "Is there a newer veta?" — asked once a day, answered after the command.
 *
 * The check is started before the command runs so the registry round-trip
 * overlaps real work, and it is allowed to lose: timeout, offline, a broken
 * cache file, a malformed answer all collapse to `null`. Nothing here may
 * ever change an exit code.
 */

export type UpdateCache = { readonly checkedAt: number; readonly latest: string };

export type UpdateCacheStore = {
  read(): Promise<UpdateCache | null>;
  write(cache: UpdateCache): Promise<void>;
};

export type UpdateCheckDeps = {
  readonly currentVersion: string;
  /** Resolves to the latest published version, or `null` when unknown. */
  readonly fetchLatest: (signal: AbortSignal) => Promise<string | null>;
  readonly cache: UpdateCacheStore;
  /** Milliseconds since the epoch. */
  readonly now: () => number;
  readonly ttlMs?: number;
  readonly timeoutMs?: number;
};

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 1500;

const REGISTRY_URL = "https://registry.npmjs.org/@cmglezpdev/veta/latest";

async function latestVersion(deps: UpdateCheckDeps): Promise<string | null> {
  const ttlMs = deps.ttlMs ?? DEFAULT_TTL_MS;
  const now = deps.now();

  const cached = await deps.cache.read();
  if (cached !== null && now - cached.checkedAt < ttlMs && now >= cached.checkedAt) {
    return cached.latest;
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error("update check timed out")),
    deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  // Do not let a pending check hold the process open on its own.
  timer.unref?.();
  let latest: string | null;
  try {
    latest = await deps.fetchLatest(controller.signal);
  } finally {
    clearTimeout(timer);
  }
  if (latest === null) {
    return null;
  }
  await deps.cache.write({ checkedAt: now, latest });
  return latest;
}

/**
 * Kick off the check immediately; `result()` resolves to the newer version
 * or `null`, and never rejects.
 */
export function startUpdateCheck(deps: UpdateCheckDeps): { result(): Promise<string | null> } {
  const pending = latestVersion(deps)
    .then((latest) =>
      latest !== null && isNewerVersion(latest, deps.currentVersion) ? latest : null,
    )
    .catch(() => null);

  return { result: () => pending };
}

/** The real registry lookup: the `latest` dist-tag's manifest, `.version` out of it. */
export async function fetchLatestFromNpm(signal: AbortSignal): Promise<string | null> {
  const response = await fetch(REGISTRY_URL, {
    signal,
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    return null;
  }
  const body: unknown = await response.json();
  return isRecord(body) && typeof body["version"] === "string" ? body["version"] : null;
}

function parseCache(value: unknown): UpdateCache | null {
  if (!isRecord(value)) {
    return null;
  }
  const { checkedAt, latest } = value;
  if (typeof checkedAt !== "number" || !Number.isFinite(checkedAt) || typeof latest !== "string") {
    return null;
  }
  return { checkedAt, latest };
}

/** A cache that lives in one JSON file; unreadable or malformed content reads as absent. */
export function fileUpdateCache(filePath: string): UpdateCacheStore {
  return {
    read: async () => parseCache(await readJsonFile(filePath)),
    write: async (cache) => {
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeJsonAtomic(filePath, cache);
    },
  };
}

/**
 * Whether to check at all. Opt-outs follow the `update-notifier` convention
 * (`NO_UPDATE_NOTIFIER`, `CI`) plus veta's own switch; non-interactive
 * sessions and completion calls never see the notice either.
 */
export function shouldCheckForUpdates(
  env: NodeJS.ProcessEnv,
  stderrIsTTY: boolean,
  argv: readonly string[],
): boolean {
  if (env["NO_UPDATE_NOTIFIER"] !== undefined) return false;
  if (env["CI"] !== undefined) return false;
  if (env["VETA_NO_UPDATE_CHECK"] !== undefined) return false;
  if (!stderrIsTTY) return false;
  if (argv.includes("--get-yargs-completions")) return false;
  return true;
}
