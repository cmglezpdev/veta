import { describe, expect, it } from "vitest";
import { formatClock } from "./clock.ts";

describe("formatClock", () => {
  it("omits the hour below an hour, without padding the minutes", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(3_599)).toBe("59:59");
  });

  it("pads the minutes once an hour is shown", () => {
    expect(formatClock(3_600)).toBe("1:00:00");
    expect(formatClock(3_725)).toBe("1:02:05");
    expect(formatClock(4_861)).toBe("1:21:01");
  });

  it("truncates fractional seconds", () => {
    expect(formatClock(95.9)).toBe("1:35");
  });

  it("floors a negative position to zero", () => {
    expect(formatClock(-10)).toBe("0:00");
  });
});
