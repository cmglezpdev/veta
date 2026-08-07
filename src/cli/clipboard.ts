import { spawn } from "node:child_process";

type ClipboardCommand = {
  readonly command: string;
  readonly args: readonly string[];
};

/**
 * The commands worth trying, most specific first.
 *
 * `VETA_CLIPBOARD_CMD` names one executable that receives the text on stdin —
 * the same seam the yt-dlp adapter uses for its binary, so tests (and users on
 * unusual setups) can substitute a real script rather than a mock. Without it,
 * the platform decides: macOS and Windows each ship one clipboard writer,
 * while Linux depends on the display server, so both common tools are tried.
 */
function clipboardCommands(): readonly ClipboardCommand[] {
  const custom = process.env["VETA_CLIPBOARD_CMD"];
  if (custom !== undefined && custom !== "") {
    return [{ command: custom, args: [] }];
  }

  switch (process.platform) {
    case "darwin":
      return [{ command: "pbcopy", args: [] }];
    case "win32":
      return [{ command: "clip", args: [] }];
    default:
      return [
        { command: "wl-copy", args: [] },
        { command: "xclip", args: ["-selection", "clipboard"] },
      ];
  }
}

/** Run one candidate, feeding `text` to its stdin, resolving only on exit 0. */
function pipeInto(candidate: ClipboardCommand, text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(candidate.command, candidate.args, {
      stdio: ["pipe", "ignore", "ignore"],
    });

    // A command that dies before draining stdin raises EPIPE here; the exit
    // code already tells that story, so the write error itself is dropped.
    child.stdin.on("error", () => {});

    child.on("error", (error) => {
      reject(new Error(`Could not run ${candidate.command}.`, { cause: error }));
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${candidate.command} exited with code ${String(code)}.`));
    });

    child.stdin.end(text);
  });
}

/**
 * Put `text` on the system clipboard.
 *
 * @throws Error when no clipboard command could take the text; `cause` carries
 *   the last underlying failure. Deliberately not a `VetaError`: a clipboard
 *   miss is a courtesy lost, not an extraction failure, and callers treat it
 *   as non-fatal.
 */
export async function copyToClipboard(text: string): Promise<void> {
  let lastFailure: unknown;

  for (const candidate of clipboardCommands()) {
    try {
      await pipeInto(candidate, text);
      return;
    } catch (error) {
      lastFailure = error;
    }
  }

  throw new Error("Could not copy to the clipboard.", { cause: lastFailure });
}
