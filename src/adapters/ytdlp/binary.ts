import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";
import { VetaError } from "../../domain/errors/veta-error.ts";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

export type BinarySource = "config" | "path" | "bundled";

export type ResolvedBinary = {
  readonly path: string;
  readonly source: BinarySource;
  readonly version: string;
};

export type ResolveBinaryOptions = {
  readonly explicitPath?: string | null;
  readonly env?: NodeJS.ProcessEnv;
};

let cached: Promise<ResolvedBinary> | undefined;

async function probe(
  binaryPath: string,
  source: BinarySource,
  env: NodeJS.ProcessEnv,
): Promise<ResolvedBinary | null> {
  try {
    if (source !== "path") await access(binaryPath, constants.X_OK);
    const { stdout } = await execFileAsync(binaryPath, ["--version"], { env });
    const version = stdout.trim();
    return version === "" ? null : { path: binaryPath, source, version };
  } catch {
    return null;
  }
}

function bundledPath(): string | null {
  try {
    const packageJson = require.resolve("youtube-dl-exec/package.json");
    const name = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
    return path.join(path.dirname(packageJson), "bin", name);
  } catch {
    return null;
  }
}

async function resolveUncached(options: ResolveBinaryOptions): Promise<ResolvedBinary> {
  const env = options.env ?? process.env;
  const configuredPath = options.explicitPath ?? env["VETA_YTDLP_PATH"];

  if (configuredPath) {
    const configured = await probe(configuredPath, "config", env);
    if (configured !== null) return configured;
  }

  const fromPath = await probe("yt-dlp", "path", env);
  if (fromPath !== null) return fromPath;

  const bundled = bundledPath();
  if (bundled !== null) {
    const resolved = await probe(bundled, "bundled", env);
    if (resolved !== null) return resolved;
  }

  throw new VetaError(
    "YTDLP_NOT_FOUND",
    "No usable yt-dlp binary was found. Reinstall with pnpm so install scripts can download it, or configure ytDlpPath (VETA_YTDLP_PATH) to an executable.",
  );
}

/** Resolve yt-dlp on first use and reuse the successful result process-wide. */
export function resolveYtDlpBinary(options: ResolveBinaryOptions = {}): Promise<ResolvedBinary> {
  cached ??= resolveUncached(options).catch((error: unknown) => {
    cached = undefined;
    throw error;
  });
  return cached;
}

/** Test-only cache reset; production code should resolve once per process. */
export function resetBinaryCache(): void {
  cached = undefined;
}
