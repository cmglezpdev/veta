import { describe, expect, it } from "vitest";
import { isValidDirName, slugify } from "./slug.ts";

/**
 * Each case pins one stage of the slugify pipeline: normalization, accent folding,
 * truncation, Windows escaping, trailing cleanup, and the externalId fallback.
 */
describe("slugify", () => {
  it("lowercases and hyphenates a plain title", () => {
    expect(slugify("Building OpenCode with Dax Raad", "1VqKUrxR2C8")).toBe(
      "building-opencode-with-dax-raad",
    );
  });

  it("strips combining marks after NFKD normalization", () => {
    expect(slugify("Café résumé", "abc12345678")).toBe("cafe-resume");
  });

  it("truncates at a hyphen boundary within 60 characters", () => {
    const long =
      "This Is An Extremely Long Video Title That Should Be Truncated At A Hyphen Boundary Not Mid Word";
    const slug = slugify(long, "abc12345678");
    expect(slug.length).toBeLessThanOrEqual(60);
    // a hyphen anchored at the end of the string: the cut must not leave one dangling
    expect(slug).not.toMatch(/-$/);
    // the 60-char window ends mid-title, so the last word must have been dropped whole
    expect(slug.endsWith("-word")).toBe(false);
  });

  it.each([
    ["CON", "con"],
    ["PRN report", "prn-report"],
    ["AUX channel", "aux-channel"],
    ["NUL device", "nul-device"],
    ["COM1 port", "com1-port"],
    ["COM9 port", "com9-port"],
    ["LPT1 printer", "lpt1-printer"],
    ["LPT9 printer", "lpt9-printer"],
  ])("prefixes Windows-reserved stem %s with v-", (title, expectedSuffix) => {
    const slug = slugify(title, "abc12345678");
    expect(slug.startsWith("v-")).toBe(true);
    expect(slug.endsWith(expectedSuffix)).toBe(true);
  });

  it("strips trailing dots and spaces", () => {
    expect(slugify("Hello World...   ", "abc12345678")).toBe("hello-world");
  });

  it("falls back to externalId when the title slug is empty", () => {
    expect(slugify("!!!", "1VqKUrxR2C8")).toBe("1vqkurxr2c8");
  });

  it("replaces non-alphanumeric runs with a single hyphen", () => {
    expect(slugify("foo---bar   baz", "abc12345678")).toBe("foo-bar-baz");
  });
});

/**
 * The invariant that matters: whatever `slugify` returns is always a legal dirName.
 * The corpus below is the adversarial half; the explicit rejections are the guard rail.
 */
describe("isValidDirName", () => {
  it("accepts slugified titles from a hostile corpus", () => {
    const externalId = "1VqKUrxR2C8";
    const titles = [
      "", // empty title -> externalId fallback
      ".", // path component that must never survive
      "..", // parent traversal, likewise
      "!!!", // nothing but punctuation -> empty slug -> fallback
      "CON", // bare Windows device name
      "com9", // device name already lowercased
      "  spaces  ", // leading and trailing whitespace
      "Café 🎬 résumé", // accents plus an astral-plane emoji
      "a".repeat(200), // beyond MAX_SLUG_LENGTH, no hyphen to cut at
      "file/name\\test", // path separators, both flavours
      "trailing dots...", // dots Windows would silently strip
      "under_score-and.dots", // characters legal in a dirName but not in a slug
      "日本語タイトル", // no ASCII at all -> fallback
      "Mixed CASE Title!", // uppercase plus trailing punctuation
      "lpt9:", // device name followed by an illegal character
      "aux.", // device name with the dot Windows ignores
    ];

    for (const title of titles) {
      const slug = slugify(title, externalId);
      expect(isValidDirName(slug), `invalid slug for ${JSON.stringify(title)}: ${slug}`).toBe(
        true,
      );
    }
  });

  it("rejects dot and double-dot", () => {
    expect(isValidDirName(".")).toBe(false);
    expect(isValidDirName("..")).toBe(false);
  });
});
