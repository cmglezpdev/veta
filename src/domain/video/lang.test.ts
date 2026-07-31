import { describe, expect, it } from "vitest";
import { baseSubtag, isOriginalMarker } from "./lang.ts";

describe("baseSubtag", () => {
  // The comparison this exists for: a locale against a caption key.
  it("reduces a locale to its primary subtag", () => {
    expect(baseSubtag("en-US")).toBe("en");
    expect(baseSubtag("es-419")).toBe("es");
    expect(baseSubtag("pt-BR")).toBe("pt");
  });

  it("reduces the non-standard original marker too", () => {
    expect(baseSubtag("en-orig")).toBe("en");
  });

  it("normalizes case and surrounding space", () => {
    expect(baseSubtag("EN")).toBe("en");
    expect(baseSubtag("  En-US  ")).toBe("en");
  });

  it("passes a bare subtag through", () => {
    expect(baseSubtag("en")).toBe("en");
  });

  it("yields an empty string for empty input rather than throwing", () => {
    expect(baseSubtag("")).toBe("");
    expect(baseSubtag("   ")).toBe("");
  });
});

describe("isOriginalMarker", () => {
  it("recognizes the marker on two- and three-letter subtags", () => {
    expect(isOriginalMarker("en-orig")).toBe(true);
    expect(isOriginalMarker("fil-orig")).toBe(true);
    expect(isOriginalMarker("EN-ORIG")).toBe(true);
  });

  it("rejects ordinary language keys", () => {
    expect(isOriginalMarker("en")).toBe(false);
    expect(isOriginalMarker("es-419")).toBe(false);
    expect(isOriginalMarker("en-US")).toBe(false);
  });

  it("rejects keys that merely contain the marker", () => {
    expect(isOriginalMarker("en-original")).toBe(false);
    expect(isOriginalMarker("orig")).toBe(false);
    expect(isOriginalMarker("x-en-orig")).toBe(false);
  });
});
