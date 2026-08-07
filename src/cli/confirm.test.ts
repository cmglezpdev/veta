import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { confirmEnter } from "./confirm.ts";

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
