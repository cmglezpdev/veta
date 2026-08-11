import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { confirmEnter, confirmYesNo } from "./confirm.ts";

const MESSAGE = "Press Enter to continue ";

describe("confirmEnter", () => {
  it("writes the message to the output stream", async () => {
    const input = new PassThrough();
    const output = new PassThrough();

    const answer = confirmEnter(input, output, MESSAGE);
    input.end("\n");
    await answer;

    expect(output.read()?.toString("utf8")).toBe(MESSAGE);
  });

  it("resolves true on a plain Enter", async () => {
    const input = new PassThrough();

    const answer = confirmEnter(input, new PassThrough(), MESSAGE);
    input.write("\n");

    await expect(answer).resolves.toBe(true);
  });

  it("resolves false for any other line", async () => {
    const input = new PassThrough();

    const answer = confirmEnter(input, new PassThrough(), MESSAGE);
    input.write("n\n");

    await expect(answer).resolves.toBe(false);
  });

  it("resolves false when the input ends without a line", async () => {
    const input = new PassThrough();

    const answer = confirmEnter(input, new PassThrough(), MESSAGE);
    input.end();

    await expect(answer).resolves.toBe(false);
  });
});

const QUESTION = "Permanently delete all stored extraction data?";

describe("confirmYesNo", () => {
  it("writes the message followed by the [y/N] hint to the output stream", async () => {
    const input = new PassThrough();
    const output = new PassThrough();

    const answer = confirmYesNo(input, output, QUESTION);
    input.end("\n");
    await answer;

    const written = output.read()?.toString("utf8");
    expect(written).toContain(QUESTION);
    expect(written).toContain("[y/N]");
  });

  it("resolves true on y", async () => {
    const input = new PassThrough();

    const answer = confirmYesNo(input, new PassThrough(), QUESTION);
    input.write("y\n");

    await expect(answer).resolves.toBe(true);
  });

  it("resolves true on yes", async () => {
    const input = new PassThrough();

    const answer = confirmYesNo(input, new PassThrough(), QUESTION);
    input.write("yes\n");

    await expect(answer).resolves.toBe(true);
  });

  it("resolves true on uppercase Y with surrounding spaces", async () => {
    const input = new PassThrough();

    const answer = confirmYesNo(input, new PassThrough(), QUESTION);
    input.write("  Y  \n");

    await expect(answer).resolves.toBe(true);
  });

  it("resolves true on uppercase YES with surrounding spaces", async () => {
    const input = new PassThrough();

    const answer = confirmYesNo(input, new PassThrough(), QUESTION);
    input.write("  YES  \n");

    await expect(answer).resolves.toBe(true);
  });

  it("resolves false on an empty line, because No is the default", async () => {
    const input = new PassThrough();

    const answer = confirmYesNo(input, new PassThrough(), QUESTION);
    input.write("\n");

    await expect(answer).resolves.toBe(false);
  });

  it("resolves false on n", async () => {
    const input = new PassThrough();

    const answer = confirmYesNo(input, new PassThrough(), QUESTION);
    input.write("n\n");

    await expect(answer).resolves.toBe(false);
  });

  it("resolves false on arbitrary text", async () => {
    const input = new PassThrough();

    const answer = confirmYesNo(input, new PassThrough(), QUESTION);
    input.write("sure why not\n");

    await expect(answer).resolves.toBe(false);
  });

  it("resolves false when the input ends without a line", async () => {
    const input = new PassThrough();

    const answer = confirmYesNo(input, new PassThrough(), QUESTION);
    input.end();

    await expect(answer).resolves.toBe(false);
  });
});
