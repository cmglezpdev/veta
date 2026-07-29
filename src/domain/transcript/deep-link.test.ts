import { describe, expect, it } from "vitest";
import { deepLink } from "./deep-link.ts";

const WATCH = "https://www.youtube.com/watch?v=abc123";
const SHORT = "https://youtu.be/abc123";

describe("deepLink", () => {
  // NORM-05: every timestamp resolves to that exact second in the source.
  it("appends the moment to a URL that already carries a query", () => {
    expect(deepLink(WATCH, 754_000)).toBe(`${WATCH}&t=754`);
  });

  it("opens the query on a URL that has none", () => {
    expect(deepLink(SHORT, 754_000)).toBe(`${SHORT}?t=754`);
  });

  // Truncating lands the viewer just before the first word; rounding up would
  // land them just after it.
  it("truncates to the second rather than rounding", () => {
    expect(deepLink(SHORT, 7_999)).toBe(`${SHORT}?t=7`);
    expect(deepLink(SHORT, 7_000)).toBe(`${SHORT}?t=7`);
  });

  it("never emits a negative moment", () => {
    expect(deepLink(SHORT, 0)).toBe(`${SHORT}?t=0`);
    expect(deepLink(SHORT, -5_000)).toBe(`${SHORT}?t=0`);
  });

  // The URL arrives from outside the process. A link that is slightly wrong
  // is recoverable; throwing mid-render is not.
  it("does not throw on a URL it cannot parse", () => {
    expect(() => deepLink("not a url at all", 1_000)).not.toThrow();
  });
});
