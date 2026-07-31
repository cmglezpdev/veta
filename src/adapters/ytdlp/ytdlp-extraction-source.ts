import { mkdir, readFile, rename, stat } from "node:fs/promises";
import path from "node:path";
import { VetaError } from "../../domain/errors/veta-error.ts";
import type { CaptionTrack, VideoMetadata } from "../../domain/video/metadata.ts";
import type {
  ExtractionSourcePort,
  RawArtifact,
  SourceHealth,
  SourceIdentity,
  WorkDir,
} from "../../ports/extraction-source.ts";
import { resolveYtDlpBinary } from "./binary.ts";
import { parseInfoJson } from "./info-json.ts";
import { invokeYtDlp } from "./invoke.ts";
import { parseJson3 } from "./json3.ts";

const SOURCE_ID = "yt-dlp";
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

function canonicalUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function videoIdFromUrl(input: string): string | null {
  try {
    const url = new URL(input);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");

    if (hostname === "youtu.be") {
      return url.pathname.split("/").filter(Boolean)[0] ?? null;
    }

    if (hostname !== "youtube.com" && hostname !== "m.youtube.com") return null;
    if (url.pathname === "/watch") return url.searchParams.get("v");

    const [kind, id] = url.pathname.split("/").filter(Boolean);
    return kind === "shorts" || kind === "embed" ? (id ?? null) : null;
  } catch {
    return null;
  }
}

function rawArtifact(relPath: string, bytes: number): RawArtifact {
  return { relPath, bytes };
}

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8")) as unknown;
}

export class YtDlpExtractionSource implements ExtractionSourcePort {
  readonly sourceId = SOURCE_ID;

  async identify(input: string): Promise<SourceIdentity> {
    const normalized = input.trim();
    const candidate = VIDEO_ID.test(normalized) ? normalized : videoIdFromUrl(normalized);
    if (candidate === null || !VIDEO_ID.test(candidate)) {
      throw new VetaError(
        "INPUT_UNRECOGNIZED",
        "Expected a YouTube URL or an 11-character YouTube video id.",
      );
    }

    return {
      sourceId: SOURCE_ID,
      externalId: candidate,
      canonicalUrl: canonicalUrl(candidate),
    };
  }

  async fetchMetadata(
    identity: SourceIdentity,
    workDir: WorkDir,
  ): Promise<{ metadata: VideoMetadata; raw: RawArtifact }> {
    const rawDir = path.join(workDir, "raw");
    await mkdir(rawDir, { recursive: true });
    const binary = await resolveYtDlpBinary();
    const outputStem = path.join("raw", "source");

    await invokeYtDlp(
      binary.path,
      [
        "--no-playlist",
        "--skip-download",
        "--no-progress",
        "--write-info-json",
        "--socket-timeout",
        "30",
        "-o",
        outputStem,
        identity.canonicalUrl ?? canonicalUrl(identity.externalId),
      ],
      { cwd: workDir },
    );

    const produced = path.join(workDir, `${outputStem}.info.json`);
    const destination = path.join(rawDir, "info.json");
    await rename(produced, destination);
    const file = await stat(destination);

    return {
      metadata: parseInfoJson(await readJson(destination)),
      raw: rawArtifact("raw/info.json", file.size),
    };
  }

  async fetchThumbnail(
    _metadata: VideoMetadata,
    _workDir: WorkDir,
  ): Promise<{ file: RawArtifact } | null> {
    // Thumbnail transfer belongs to a later slice; metadata still exposes its URL.
    return null;
  }

  async fetchCaptions(
    identity: SourceIdentity,
    track: CaptionTrack,
    workDir: WorkDir,
  ): Promise<{ document: ReturnType<typeof parseJson3>; raw: RawArtifact }> {
    if (!/^[A-Za-z0-9_-]+$/.test(track.sourceKey)) {
      throw new VetaError("PAYLOAD_SHAPE_CHANGED", "Caption track key is not filesystem-safe.");
    }

    const rawDir = path.join(workDir, "raw");
    await mkdir(rawDir, { recursive: true });
    const binary = await resolveYtDlpBinary();
    const outputStem = path.join("raw", "source");
    const writeFlag = track.kind === "manual" ? "--write-subs" : "--write-auto-subs";

    await invokeYtDlp(
      binary.path,
      [
        "--no-playlist",
        "--skip-download",
        "--no-progress",
        writeFlag,
        "--sub-langs",
        track.sourceKey,
        "--sub-format",
        "json3",
        "--socket-timeout",
        "30",
        "-o",
        outputStem,
        identity.canonicalUrl ?? canonicalUrl(identity.externalId),
      ],
      { cwd: workDir },
    );

    const produced = path.join(workDir, `${outputStem}.${track.sourceKey}.json3`);
    const relPath = `raw/captions.${track.sourceKey}.json3`;
    const destination = path.join(workDir, relPath);
    await rename(produced, destination);
    const file = await stat(destination);

    return {
      document: parseJson3(await readJson(destination)),
      raw: rawArtifact(relPath, file.size),
    };
  }

  async health(): Promise<SourceHealth> {
    try {
      const binary = await resolveYtDlpBinary();
      return {
        sourceId: SOURCE_ID,
        ready: true,
        summary: `yt-dlp ${binary.version} is ready.`,
        details: [
          { label: "source", value: binary.source },
          { label: "binary", value: binary.path },
          { label: "version", value: binary.version },
        ],
        warnings: [],
      };
    } catch (error) {
      return {
        sourceId: SOURCE_ID,
        ready: false,
        summary: "yt-dlp is not ready.",
        details: [],
        warnings: [
          {
            code: error instanceof VetaError ? error.code : "UNKNOWN",
            message: error instanceof Error ? error.message : String(error),
          },
        ],
      };
    }
  }
}
