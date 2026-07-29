/**
 * The dependency graph, asserted rather than agreed upon.
 *
 * `domain/transcript/chapters.ts` once imported a type from
 * `adapters/ytdlp/info-json.ts` — the domain reaching into an adapter. It
 * passed review because `import type` erases at runtime: nothing failed, no
 * bundle grew, and the layering was broken anyway. Rules a human has to
 * remember on every diff are the ones that quietly stop holding.
 *
 * Scope is the shipped graph: test files are excluded, since they are not
 * part of what layering protects and a calibration test legitimately drives
 * the whole chain end to end.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("../", import.meta.url));

/** Which layers each layer is allowed to reach into. */
const ALLOWED: Record<string, readonly string[]> = {
  domain: ["domain"],
  ports: ["domain", "ports"],
  adapters: ["domain", "ports", "adapters"],
  pipeline: ["domain", "ports", "pipeline"],
  // The composition root. Wiring everything together is its whole job.
  cli: ["domain", "ports", "adapters", "pipeline", "cli"],
  arch: ["arch"],
};

function sourceFiles(): string[] {
  return readdirSync(SRC, { recursive: true, encoding: "utf8" })
    .filter((entry) => entry.endsWith(".ts") && !entry.endsWith(".test.ts"))
    .map((entry) => entry.split(path.sep).join("/"));
}

function layerOf(relativePath: string): string | undefined {
  return relativePath.split("/")[0];
}

function importsOf(relativePath: string): string[] {
  const source = readFileSync(path.join(SRC, relativePath), "utf8");
  const specifiers = source.matchAll(/\bfrom\s*["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']/g);
  return [...specifiers].map((match) => match[1] ?? match[2] ?? "");
}

describe("layer boundaries", () => {
  const files = sourceFiles();

  it("finds the source tree", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("lets no file import from a layer it may not reach", () => {
    const violations: string[] = [];

    for (const file of files) {
      const from = layerOf(file);
      if (from === undefined || ALLOWED[from] === undefined) continue;

      for (const specifier of importsOf(file)) {
        if (!specifier.startsWith(".")) continue; // node: and npm packages

        const resolved = path
          .relative(SRC, path.resolve(path.join(SRC, path.dirname(file)), specifier))
          .split(path.sep)
          .join("/");
        const to = layerOf(resolved);

        if (to !== undefined && from !== to && !ALLOWED[from]!.includes(to)) {
          violations.push(`${file} -> ${resolved} (${from} may not import ${to})`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("covers every layer present in the tree", () => {
    const unknown = [...new Set(files.map(layerOf))].filter(
      (layer) => layer !== undefined && !layer.endsWith(".ts") && ALLOWED[layer] === undefined,
    );
    expect(unknown, "a new top-level layer needs a rule in ALLOWED").toEqual([]);
  });
});
