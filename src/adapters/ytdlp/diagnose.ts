import { VetaError, type VetaErrorCode } from "../../domain/errors/veta-error.ts";

type Signature = {
  readonly code: VetaErrorCode;
  readonly matches: (stderr: string) => boolean;
  readonly message: string;
};

const SIGNATURES: readonly Signature[] = [
  {
    code: "BOT_CHECK",
    matches: (stderr) => stderr.includes("sign in to confirm you're not a bot"),
    message: "YouTube requested bot verification. Try again from a normal network connection.",
  },
  {
    code: "RATE_LIMITED",
    matches: (stderr) => stderr.includes("http error 429") || stderr.includes("too many requests"),
    message: "YouTube rate-limited this request. Wait before trying again.",
  },
  {
    code: "VIDEO_UNAVAILABLE",
    matches: (stderr) =>
      [
        "video unavailable",
        "private video",
        "members-only",
        "age-restricted",
        "age restricted",
        "age-gate",
        "confirm your age",
      ].some((text) => stderr.includes(text)),
    message: "This video is unavailable, private, members-only, or age-restricted.",
  },
  {
    code: "LANGUAGE_UNAVAILABLE",
    matches: (stderr) => stderr.includes("requested format is not available"),
    message: "The requested caption language is not available for this video.",
  },
  {
    code: "EXTRACTION_DRIFT",
    matches: (stderr) =>
      /(unable to extract|failed to extract).*(player|nsig|signature)/i.test(stderr),
    message: "yt-dlp could not extract YouTube data. Update yt-dlp and try again.",
  },
];

function snippet(stderr: string): string {
  const compact = stderr.replace(/\s+/g, " ").trim();
  return compact.slice(0, 240) || "(no stderr output)";
}

/** Classify a failed yt-dlp process. Successful exits must never reach here. */
export function diagnose(exitCode: number, stderr: string): VetaError {
  if (exitCode === 0) {
    throw new Error("diagnose requires a non-zero exit code");
  }

  const normalized = stderr.toLowerCase();
  const match = SIGNATURES.find((signature) => signature.matches(normalized));
  if (match !== undefined) {
    return new VetaError(match.code, match.message);
  }

  return new VetaError(
    "EXTRACTION_DRIFT",
    `yt-dlp failed with exit code ${exitCode}: ${snippet(stderr)}`,
  );
}
