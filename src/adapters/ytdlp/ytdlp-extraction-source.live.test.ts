/**
 * Opt-in live contract against a real YouTube video via a real yt-dlp binary.
 *
 * Skipped unless `VETA_LIVE_TEST=1`. Not part of CI — YouTube and yt-dlp drift
 * would flake the suite. Run locally before a release or when changing the
 * adapter:
 *
 *   pnpm test:live
 *
 * Optional: `VETA_YTDLP_PATH=/path/to/yt-dlp` to pin the binary.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { selectTrack } from "../../domain/video/track-selection.ts";
import { asWorkDir } from "../../ports/extraction-source.ts";
import { resetBinaryCache } from "./binary.ts";
import { YtDlpExtractionSource } from "./ytdlp-extraction-source.ts";

/** Same video as the committed fixtures — known ASR captions, chapters. */
const LIVE_VIDEO_URL = "https://www.youtube.com/watch?v=1VqKUrxR2C8";
const LIVE_VIDEO_ID = "1VqKUrxR2C8";

const liveEnabled = process.env["VETA_LIVE_TEST"] === "1";

describe.skipIf(!liveEnabled)("YtDlpExtractionSource live (real network)", () => {
  let workRoot: string;

  beforeEach(async () => {
    resetBinaryCache();
    workRoot = await mkdtemp(path.join(tmpdir(), "veta-live-"));
  });

  afterEach(async () => {
    resetBinaryCache();
    await rm(workRoot, { force: true, recursive: true });
  });

  it(
    "resolves yt-dlp, fetches metadata, picks a track, and downloads captions",
    async () => {
      const source = new YtDlpExtractionSource();
      const workDir = asWorkDir(path.join(workRoot, "work"));

      const health = await source.health();
      expect(health.ready).toBe(true);
      expect(health.details.some((d) => d.label === "version")).toBe(true);

      const identity = await source.identify(LIVE_VIDEO_URL);
      expect(identity).toEqual({
        sourceId: "yt-dlp",
        externalId: LIVE_VIDEO_ID,
        canonicalUrl: `https://www.youtube.com/watch?v=${LIVE_VIDEO_ID}`,
      });

      const { metadata, raw } = await source.fetchMetadata(identity, workDir);
      expect(metadata.id).toBe(LIVE_VIDEO_ID);
      expect(metadata.title.length).toBeGreaterThan(0);
      expect(metadata.captionTracks.length).toBeGreaterThan(0);
      expect(raw.relPath).toBe("raw/info.json");
      expect(raw.bytes).toBeGreaterThan(100);

      const selection = selectTrack(
        metadata.captionTracks,
        metadata.originalLanguage,
      );
      expect(selection.track.sourceKey.length).toBeGreaterThan(0);

      const { document, raw: captionRaw } = await source.fetchCaptions(
        identity,
        selection.track,
        workDir,
      );
      expect(document.cues.length).toBeGreaterThan(100);
      expect(document.clampCount).toBe(0);
      expect(captionRaw.bytes).toBeGreaterThan(1_000);
      expect(captionRaw.relPath).toContain(selection.track.sourceKey);
    },
    180_000,
  );
});
