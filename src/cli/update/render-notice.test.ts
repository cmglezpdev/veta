import { describe, expect, it } from "vitest";
import { changelogUrlFor, renderUpdateNotice } from "./render-notice.ts";

const INPUT = {
  current: "0.10.0",
  latest: "0.11.0",
  changelogUrl: "https://github.com/cmglezpdev/veta/releases/tag/veta-v0.11.0",
  updateCommand: "npm install -g @cmglezpdev/veta@latest",
};

describe("changelogUrlFor()", () => {
  it("points at the GitHub release for that version", () => {
    expect(changelogUrlFor("0.11.0")).toBe(
      "https://github.com/cmglezpdev/veta/releases/tag/veta-v0.11.0",
    );
  });
});

describe("renderUpdateNotice()", () => {
  it("prints the three lines inside a rounded box without color", () => {
    const out = renderUpdateNotice({ ...INPUT, useColor: false });

    expect(out).toContain("Update available! 0.10.0 → 0.11.0");
    expect(out).toContain(`Changelog: ${INPUT.changelogUrl}`);
    expect(out).toContain(`To update, run: ${INPUT.updateCommand}`);
    expect(out).toContain("╭");
    expect(out).toContain("╮");
    expect(out).toContain("╰");
    expect(out).toContain("╯");
    expect(out).not.toContain("\x1b[");
    expect(out.endsWith("\n")).toBe(true);
  });

  it("pads every row to the same visible width", () => {
    const out = renderUpdateNotice({ ...INPUT, useColor: false });
    const rows = out.split("\n").filter((row) => row.length > 0);
    const widths = new Set(rows.map((row) => [...row].length));

    expect(rows.length).toBeGreaterThanOrEqual(5);
    expect(widths.size).toBe(1);
  });

  it("uses ANSI codes when color is on, and stays the same visible width", () => {
    const colored = renderUpdateNotice({ ...INPUT, useColor: true });
    const plain = renderUpdateNotice({ ...INPUT, useColor: false });

    expect(colored).toContain("\x1b[");
    expect(colored.replaceAll(/\x1b\[[0-9;]*m/g, "")).toBe(plain);
  });
});
