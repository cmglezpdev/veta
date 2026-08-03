/**
 * Port surface and WorkDir minting policy.
 *
 * Slice 5 keeps exactly two swappable boundaries under `src/ports/`. Production
 * code must obtain `WorkDir` values through `StorePort.openWorkDir` once
 * `FsStore` lands; until Slice 5c migrates the CLI, legacy call sites are
 * tracked explicitly below.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("../", import.meta.url));
const PORTS_DIR = path.join(SRC, "ports");

/** Where `asWorkDir` is declared; the declaration site is never an importer. */
const AS_WORK_DIR_DECLARATION = "ports/extraction-source.ts";

/** Sole allowed production minter: the adapter that owns the filesystem (design DL6). */
const ALLOWED_AS_WORK_DIR_PRODUCTION = "adapters/store/fs-store.ts";

function sourceFiles(): string[] {
  return readdirSync(SRC, { recursive: true, encoding: "utf8" })
    .filter((entry) => entry.endsWith(".ts") && !entry.endsWith(".test.ts"))
    .map((entry) => entry.split(path.sep).join("/"));
}

function importsOf(relativePath: string): string[] {
  const source = readFileSync(path.join(SRC, relativePath), "utf8");
  const specifiers = source.matchAll(/\bfrom\s*["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']/g);
  return [...specifiers].map((match) => match[1] ?? match[2] ?? "");
}

function resolvesToExtractionSource(relativePath: string, specifier: string): boolean {
  if (!specifier.startsWith(".")) return false;

  const resolved = path
    .relative(SRC, path.resolve(path.join(SRC, path.dirname(relativePath)), specifier))
    .split(path.sep)
    .join("/");

  return resolved === AS_WORK_DIR_DECLARATION;
}

function importsAsWorkDir(relativePath: string): boolean {
  const source = readFileSync(path.join(SRC, relativePath), "utf8");
  if (!/\basWorkDir\b/.test(source)) return false;

  return importsOf(relativePath).some((specifier) =>
    resolvesToExtractionSource(relativePath, specifier),
  );
}

describe("port surface", () => {
  it("exports exactly two *Port interfaces under src/ports/", () => {
    const portFiles = readdirSync(PORTS_DIR).filter((name) => name.endsWith(".ts"));
    const portInterfaces: string[] = [];

    for (const file of portFiles) {
      const source = readFileSync(path.join(PORTS_DIR, file), "utf8");
      const matches = source.matchAll(/export interface (\w*Port)\b/g);
      for (const match of matches) {
        portInterfaces.push(match[1] ?? "");
      }
    }

    expect(portInterfaces.sort()).toEqual(["ExtractionSourcePort", "StorePort"]);
  });
});

describe("WorkDir minting policy", () => {
  /**
   * Exact set equality, not a subset check: an unlisted importer is a violation,
   * and a listed file that stopped importing is a stale entry to delete. Asserting
   * only "no violations" would pass even if the allowlist described nobody (DL6).
   */
  it("confines asWorkDir to the store adapter", () => {
    const importers = sourceFiles().filter(
      (file) => file !== AS_WORK_DIR_DECLARATION && importsAsWorkDir(file),
    );

    expect(importers).toEqual([ALLOWED_AS_WORK_DIR_PRODUCTION]);
  });
});
