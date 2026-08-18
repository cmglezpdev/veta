import { execFile } from "node:child_process";
import { VetaError } from "../../domain/errors/veta-error.ts";
import { diagnose } from "./diagnose.ts";

export type InvokeOptions = {
  readonly cwd?: string;
  readonly signal?: AbortSignal;
  readonly timeout?: number;
  readonly maxBuffer?: number;
};

export type InvokeResult = {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: 0;
};

type ExecFailure = Error & {
  readonly code?: number | string | null;
};

/**
 * Invoke yt-dlp without reading user or system configuration.
 *
 * `--ignore-config` makes behavior reproducible: a user's global yt-dlp flags
 * must not silently alter veta's output paths or selected formats.
 */
export function invokeYtDlp(
  binaryPath: string,
  args: readonly string[],
  options: InvokeOptions = {},
): Promise<InvokeResult> {
  return new Promise((resolve, reject) => {
    execFile(
      binaryPath,
      ["--ignore-config", ...args],
      {
        cwd: options.cwd,
        signal: options.signal,
        timeout: options.timeout,
        maxBuffer: options.maxBuffer,
        encoding: "utf8",
      },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve({ stdout, stderr, code: 0 });
          return;
        }

        const failure = error as ExecFailure;
        if (failure.code === "ENOENT") {
          reject(
            new VetaError(
              "YTDLP_NOT_FOUND",
              `The configured yt-dlp executable does not exist: ${binaryPath}`,
              { cause: error },
            ),
          );
          return;
        }

        if (failure.name === "AbortError") {
          reject(error);
          return;
        }

        const exitCode =
          typeof failure.code === "number" && failure.code !== 0
            ? failure.code
            : 1;
        reject(diagnose(exitCode, stderr));
      },
    );
  });
}
