import { describe, expect, it } from "vitest";
import { formatPosition, memberFolderName, positionWidth } from "./position.ts";

describe("positionWidth", () => {
  it.each([
    [1, 2],
    [9, 2],
    [10, 2],
    [99, 2],
    [100, 3],
    [999, 3],
    [1000, 4],
  ])("pads a %i-member playlist to width %i", (totalCount, expected) => {
    expect(positionWidth(totalCount)).toBe(expected);
  });
});

describe("formatPosition", () => {
  it("zero-pads to the given width", () => {
    expect(formatPosition(7, 2)).toBe("07");
    expect(formatPosition(7, 3)).toBe("007");
  });

  it("does not truncate a position wider than the given width", () => {
    expect(formatPosition(123, 2)).toBe("123");
  });
});

describe("memberFolderName", () => {
  it("joins the padded position and the video slug with a hyphen", () => {
    expect(memberFolderName(7, 2, "intro-to-layers")).toBe("07-intro-to-layers");
  });

  it("survives curation: a skipped member's neighbor keeps its original position", () => {
    // A 12-member playlist where member 3 is skipped by curation: member 4
    // still renders as 04-, not 03- (spec "Member folder numbering survives
    // curation").
    expect(memberFolderName(4, positionWidth(12), "member-four")).toBe("04-member-four");
  });
});
