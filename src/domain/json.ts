/**
 * Narrowing helpers for JSON that came from outside the process — yt-dlp
 * payloads, config files on disk.
 *
 * Every one of these takes `unknown` and answers a question about it rather
 * than asserting. That is the point: a payload whose shape changed upstream
 * should produce a clear failure at the boundary, never a `TypeError` three
 * layers down.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A non-empty string, or null. Empty strings are treated as absent. */
export function asString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** A finite number, or null. Rejects NaN and Infinity. */
export function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
