import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { copyToClipboard } from "./clipboard.ts";

let root: string;
let previousClipboardCmd: string | undefined;

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/** A real executable standing in for the platform clipboard, not a double. */
async function script(body: string): Promise<string> {
  const file = path.join(root, "clipboard");
  await writeFile(file, `#!/bin/sh\n${body}\n`, "utf8");
  await chmod(file, 0o755);
  return file;
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "veta-clipboard-"));
  previousClipboardCmd = process.env["VETA_CLIPBOARD_CMD"];
});

afterEach(async () => {
  if (previousClipboardCmd === undefined) delete process.env["VETA_CLIPBOARD_CMD"];
  else process.env["VETA_CLIPBOARD_CMD"] = previousClipboardCmd;
  await rm(root, { force: true, recursive: true });
});

describe("copyToClipboard", () => {
  it("pipes the text, byte for byte, into the configured command", async () => {
    const sink = path.join(root, "received.txt");
    process.env["VETA_CLIPBOARD_CMD"] = await script(`cat > ${shellQuote(sink)}`);

    await copyToClipboard("# Prompt\n\nWith two lines.\n");

    expect(await readFile(sink, "utf8")).toBe("# Prompt\n\nWith two lines.\n");
  });

  it("rejects when the command exits non-zero", async () => {
    process.env["VETA_CLIPBOARD_CMD"] = await script("exit 1");

    await expect(copyToClipboard("anything")).rejects.toThrow(/clipboard/i);
  });

  it("rejects with the underlying cause when the command does not exist", async () => {
    process.env["VETA_CLIPBOARD_CMD"] = path.join(root, "no-such-binary");

    let caught: unknown = null;
    try {
      await copyToClipboard("anything");
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).cause).toBeDefined();
  });
});
