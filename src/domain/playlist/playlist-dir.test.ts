import { describe, expect, it } from "vitest";
import { playlistDirName, playlistNotesDir } from "./playlist-dir.ts";

describe("playlistDirName", () => {
  it("prefixes pl- and appends the lowercased id to the title slug", () => {
    expect(playlistDirName("LLM evaluation course", "PL9omX6impEuMgDFCK_NleIB0sMzKs2boI")).toBe(
      "pl-llm-evaluation-course-pl9omx6impeumgdfck_nleib0smzks2boi",
    );
  });

  it("still resolves when the title produces an empty slug", () => {
    expect(playlistDirName("!!!", "PL123")).toBe("pl-pl123-pl123");
  });
});

describe("playlistNotesDir", () => {
  it("is just the title slug, with no id and no pl- prefix", () => {
    expect(playlistNotesDir("LLM evaluation course", "PL9omX6impEuMgDFCK_NleIB0sMzKs2boI")).toBe(
      "llm-evaluation-course",
    );
  });

  it("two playlists with the same title collide on notesDir but not on dirName", () => {
    const a = playlistNotesDir("Clean Architecture Course", "PL1");
    const b = playlistNotesDir("Clean Architecture Course", "PL2");
    expect(a).toBe(b);
    expect(playlistDirName("Clean Architecture Course", "PL1")).not.toBe(
      playlistDirName("Clean Architecture Course", "PL2"),
    );
  });
});
