import { createInterface } from "node:readline";

/**
 * Ask for a bare-Enter confirmation on the given streams.
 *
 * Streams are parameters rather than `process` globals so a test can drive the
 * exchange with real `PassThrough` pipes. Only an empty submitted line counts
 * as yes: any typed character is a no, and so is the input closing without a
 * line at all — a dead stdin must never read as consent.
 */
export function confirmEnter(
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream,
  message: string,
): Promise<boolean> {
  output.write(message);

  return new Promise((resolve) => {
    const rl = createInterface({ input });
    let settled = false;

    const settle = (value: boolean): void => {
      if (settled) return;
      settled = true;
      rl.close();
      resolve(value);
    };

    rl.once("line", (line) => settle(line === ""));
    rl.once("close", () => settle(false));
  });
}
