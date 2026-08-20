import { describe, expect, it } from "vitest";
import {
  parseMemberSelection,
  parsePositionSpec,
  selectMembers,
} from "./member-selection.ts";

/** The smallest thing selectable: curation only ever reads `position`. */
function members(...positions: readonly number[]): readonly { position: number }[] {
  return positions.map((position) => ({ position }));
}

function positionsOf(selected: readonly { position: number }[]): number[] {
  return selected.map((member) => member.position);
}

describe("parsePositionSpec", () => {
  it("parses single positions and inclusive ranges", () => {
    expect(parsePositionSpec("--only", "1,3,5-8")).toEqual([
      { start: 1, end: 1 },
      { start: 3, end: 3 },
      { start: 5, end: 8 },
    ]);
  });

  it("accepts a one-member range (5-5) and whitespace around entries", () => {
    expect(parsePositionSpec("--only", " 2 , 5-5 ")).toEqual([
      { start: 2, end: 2 },
      { start: 5, end: 5 },
    ]);
  });

  it.each([
    ["an empty spec", ""],
    ["an empty entry", "1,,3"],
    ["a trailing comma", "1,3,"],
    ["garbage", "abc"],
    ["a signed number", "+3"],
    ["a decimal", "1.5"],
    ["a reversed range (5-3)", "5-3"],
    ["position zero", "0"],
    ["zero as a range start", "0-4"],
    ["a double dash", "1--3"],
  ])("rejects %s with INPUT_UNRECOGNIZED naming the flag", (_label, spec) => {
    expect(() => parsePositionSpec("--skip-only", spec)).toThrowError(
      expect.objectContaining({ code: "INPUT_UNRECOGNIZED", message: expect.stringContaining("--skip-only") }),
    );
  });
});

describe("parseMemberSelection", () => {
  it("returns null when no curation flag was given", () => {
    expect(parseMemberSelection({})).toBeNull();
  });

  it("carries every provided flag, parsed", () => {
    expect(parseMemberSelection({ limit: 10, skip: 5, only: "1,3-4" })).toEqual({
      only: [
        { start: 1, end: 1 },
        { start: 3, end: 4 },
      ],
      skipOnly: null,
      skip: 5,
      limit: 10,
    });
  });

  it("rejects combining --only with --skip-only", () => {
    expect(() => parseMemberSelection({ only: "1", skipOnly: "2" })).toThrowError(
      expect.objectContaining({ code: "INPUT_UNRECOGNIZED" }),
    );
  });

  it.each([
    ["--limit 0", { limit: 0 }],
    ["--limit -1", { limit: -1 }],
    ["a non-integer --limit", { limit: 2.5 }],
    ["a non-numeric --limit (NaN from yargs)", { limit: Number.NaN }],
    ["--skip -1", { skip: -1 }],
    ["a non-integer --skip", { skip: 0.5 }],
    ["a non-numeric --skip (NaN from yargs)", { skip: Number.NaN }],
  ])("rejects %s with INPUT_UNRECOGNIZED", (_label, flags) => {
    expect(() => parseMemberSelection(flags)).toThrowError(
      expect.objectContaining({ code: "INPUT_UNRECOGNIZED" }),
    );
  });

  it("accepts --skip 0 as an explicit no-op skip", () => {
    expect(parseMemberSelection({ skip: 0 })).toEqual({ only: null, skipOnly: null, skip: 0, limit: null });
  });
});

describe("selectMembers", () => {
  const twelve = members(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12);

  function select(flags: Parameters<typeof parseMemberSelection>[0]) {
    const selection = parseMemberSelection(flags);
    if (selection === null) throw new Error("test expected curation flags");
    return positionsOf(selectMembers(twelve, selection));
  }

  it("--only keeps exactly the named original positions, in playlist order", () => {
    expect(select({ only: "8,1,3-5" })).toEqual([1, 3, 4, 5, 8]);
  });

  it("--skip-only keeps everything except the named positions", () => {
    expect(select({ skipOnly: "2-11" })).toEqual([1, 12]);
  });

  it("--skip and --limit compose like pagination: skip 5 limit 10 is positions 6..15", () => {
    const twenty = members(...Array.from({ length: 20 }, (_, i) => i + 1));
    const selection = parseMemberSelection({ skip: 5, limit: 10 });
    expect(positionsOf(selectMembers(twenty, selection!))).toEqual([6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  });

  it("applies the position filter first, then --skip, then --limit", () => {
    expect(select({ only: "2,4-8,11", skip: 1, limit: 3 })).toEqual([4, 5, 6]);
  });

  it("--skip counts members, not positions: skipping over a filtered gap", () => {
    // Positions 3 and 4 are gone before --skip runs, so skip 2 drops 1 and 2
    // and the selection starts at 5 — never at 3.
    expect(select({ skipOnly: "3-4", skip: 2 })).toEqual([5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("positions beyond the playlist size match nothing without being an error", () => {
    expect(select({ only: "11-999" })).toEqual([11, 12]);
  });

  it("can select nothing; the caller decides that is fatal", () => {
    expect(select({ only: "100" })).toEqual([]);
  });

  it("never renumbers: survivors keep their original position values", () => {
    const selection = parseMemberSelection({ only: "12" });
    expect(selectMembers(twelve, selection!)).toEqual([{ position: 12 }]);
  });
});
