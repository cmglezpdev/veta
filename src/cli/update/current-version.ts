import { readFile } from "node:fs/promises";
import { isRecord } from "../../domain/json.ts";

/**
 * The running veta's version, from the package manifest.
 *
 * `src/cli/update/` and `dist/cli/update/` sit at the same depth, so one
 * relative URL serves both the source tree and the published build.
 */
const PACKAGE_JSON = new URL("../../../package.json", import.meta.url);

export async function readCurrentVersion(): Promise<string> {
  try {
    const manifest: unknown = JSON.parse(await readFile(PACKAGE_JSON, "utf8"));
    return isRecord(manifest) && typeof manifest["version"] === "string"
      ? manifest["version"]
      : "0.0.0";
  } catch {
    return "0.0.0";
  }
}
