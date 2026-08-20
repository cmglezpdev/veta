import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  fileUpdateCache,
  shouldCheckForUpdates,
  startUpdateCheck,
  type UpdateCache,
} from "./update-check.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

function memoryCache(initial: UpdateCache | null = null) {
  let stored = initial;
  const writes: UpdateCache[] = [];
  return {
    writes,
    cache: {
      read: async () => stored,
      write: async (value: UpdateCache) => {
        stored = value;
        writes.push(value);
      },
    },
  };
}

describe("startUpdateCheck()", () => {
  it("uses the cached latest without hitting the network when fresh", async () => {
    const { cache, writes } = memoryCache({ checkedAt: 1_000, latest: "0.11.0" });
    let fetched = 0;
    const check = startUpdateCheck({
      currentVersion: "0.10.0",
      fetchLatest: async () => {
        fetched += 1;
        return "9.9.9";
      },
      cache,
      now: () => 1_000 + DAY_MS - 1,
    });

    await expect(check.result()).resolves.toBe("0.11.0");
    expect(fetched).toBe(0);
    expect(writes).toEqual([]);
  });

  it("fetches and writes the cache when the cache is missing", async () => {
    const { cache, writes } = memoryCache(null);
    const check = startUpdateCheck({
      currentVersion: "0.10.0",
      fetchLatest: async () => "0.12.0",
      cache,
      now: () => 5_000,
    });

    await expect(check.result()).resolves.toBe("0.12.0");
    expect(writes).toEqual([{ checkedAt: 5_000, latest: "0.12.0" }]);
  });

  it("fetches and writes the cache when the cache is stale", async () => {
    const { cache, writes } = memoryCache({ checkedAt: 0, latest: "0.10.1" });
    const check = startUpdateCheck({
      currentVersion: "0.10.0",
      fetchLatest: async () => "0.12.0",
      cache,
      now: () => DAY_MS,
    });

    await expect(check.result()).resolves.toBe("0.12.0");
    expect(writes).toEqual([{ checkedAt: DAY_MS, latest: "0.12.0" }]);
  });

  it("honours a custom ttl", async () => {
    const { cache } = memoryCache({ checkedAt: 0, latest: "0.10.1" });
    const check = startUpdateCheck({
      currentVersion: "0.10.0",
      fetchLatest: async () => "0.12.0",
      cache,
      now: () => 50,
      ttlMs: 100,
    });

    await expect(check.result()).resolves.toBe("0.10.1");
  });

  it("resolves null when the fetch rejects", async () => {
    const { cache, writes } = memoryCache(null);
    const check = startUpdateCheck({
      currentVersion: "0.10.0",
      fetchLatest: async () => {
        throw new Error("offline");
      },
      cache,
      now: () => 0,
    });

    await expect(check.result()).resolves.toBeNull();
    expect(writes).toEqual([]);
  });

  it("resolves null when the fetch returns null", async () => {
    const { cache } = memoryCache(null);
    const check = startUpdateCheck({
      currentVersion: "0.10.0",
      fetchLatest: async () => null,
      cache,
      now: () => 0,
    });

    await expect(check.result()).resolves.toBeNull();
  });

  it("resolves null when the fetch does not answer before the timeout", async () => {
    const { cache } = memoryCache(null);
    let aborted = false;
    const check = startUpdateCheck({
      currentVersion: "0.10.0",
      fetchLatest: (signal) =>
        new Promise<string | null>((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            aborted = true;
            reject(signal.reason);
          });
        }),
      cache,
      now: () => 0,
      timeoutMs: 5,
    });

    await expect(check.result()).resolves.toBeNull();
    expect(aborted).toBe(true);
  });

  it("resolves null when the cache throws", async () => {
    const check = startUpdateCheck({
      currentVersion: "0.10.0",
      fetchLatest: async () => "0.12.0",
      cache: {
        read: async () => {
          throw new Error("disk");
        },
        write: async () => {
          throw new Error("disk");
        },
      },
      now: () => 0,
    });

    await expect(check.result()).resolves.toBeNull();
  });

  it("resolves null when latest is not newer than current", async () => {
    const { cache } = memoryCache(null);
    const check = startUpdateCheck({
      currentVersion: "0.10.0",
      fetchLatest: async () => "0.10.0",
      cache,
      now: () => 0,
    });

    await expect(check.result()).resolves.toBeNull();
  });

  it("starts the fetch eagerly, before result() is called", async () => {
    const { cache } = memoryCache(null);
    let started = false;
    startUpdateCheck({
      currentVersion: "0.10.0",
      fetchLatest: async () => {
        started = true;
        return null;
      },
      cache,
      now: () => 0,
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(started).toBe(true);
  });
});

describe("fileUpdateCache()", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "veta-update-cache-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("reads null when the file is missing", async () => {
    const cache = fileUpdateCache(path.join(dir, "update-check.json"));
    await expect(cache.read()).resolves.toBeNull();
  });

  it("round-trips a cache entry", async () => {
    const file = path.join(dir, "update-check.json");
    const cache = fileUpdateCache(file);
    await cache.write({ checkedAt: 123, latest: "0.11.0" });

    await expect(cache.read()).resolves.toEqual({ checkedAt: 123, latest: "0.11.0" });
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ checkedAt: 123, latest: "0.11.0" });
  });

  it("creates the parent directory when missing", async () => {
    const file = path.join(dir, "nested", "deeper", "update-check.json");
    const cache = fileUpdateCache(file);
    await cache.write({ checkedAt: 1, latest: "0.11.0" });

    await expect(cache.read()).resolves.toEqual({ checkedAt: 1, latest: "0.11.0" });
  });

  it("reads null for malformed or wrongly shaped content", async () => {
    const file = path.join(dir, "update-check.json");
    await writeFile(file, "{not json", "utf8");
    await expect(fileUpdateCache(file).read()).resolves.toBeNull();

    await writeFile(file, JSON.stringify({ checkedAt: "yesterday", latest: 3 }), "utf8");
    await expect(fileUpdateCache(file).read()).resolves.toBeNull();
  });
});

describe("shouldCheckForUpdates()", () => {
  const argv = ["node", "veta", "list"];

  it("is true in an interactive session with no opt-out", () => {
    expect(shouldCheckForUpdates({}, true, argv)).toBe(true);
  });

  it("is false when stderr is not a TTY", () => {
    expect(shouldCheckForUpdates({}, false, argv)).toBe(false);
  });

  it("is false under NO_UPDATE_NOTIFIER, CI or VETA_NO_UPDATE_CHECK", () => {
    expect(shouldCheckForUpdates({ NO_UPDATE_NOTIFIER: "1" }, true, argv)).toBe(false);
    expect(shouldCheckForUpdates({ CI: "true" }, true, argv)).toBe(false);
    expect(shouldCheckForUpdates({ VETA_NO_UPDATE_CHECK: "1" }, true, argv)).toBe(false);
  });

  it("is false during shell completion", () => {
    expect(shouldCheckForUpdates({}, true, ["node", "veta", "--get-yargs-completions", "ex"])).toBe(
      false,
    );
  });
});
