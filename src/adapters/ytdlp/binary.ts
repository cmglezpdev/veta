import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { promisify } from "node:util";
import { VetaError } from "../../domain/errors/veta-error.ts";

const execFileAsync = promisify(execFile);

export type BinarySource = "config" | "path";

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

async function resolveUncached(options: ResolveBinaryOptions): Promise<ResolvedBinary> {
  const env = options.env ?? process.env;
  const configuredPath = options.explicitPath ?? env["VETA_YTDLP_PATH"];

  if (configuredPath) {
    const configured = await probe(configuredPath, "config", env);
    if (configured !== null) return configured;
  }

  const fromPath = await probe("yt-dlp", "path", env);
  if (fromPath !== null) return fromPath;

  throw new VetaError(
    "YTDLP_NOT_FOUND",
    "No usable yt-dlp binary was found. Install it with `brew install yt-dlp` or `pipx install yt-dlp`, or point VETA_YTDLP_PATH at an existing executable.",
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
