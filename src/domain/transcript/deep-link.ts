/**
 * Build a link that opens the video at a given moment.
 *
 * The parameter is appended as text rather than through `URL`, because the
 * canonical URL arrives from outside the process and may not parse. A link
 * that is slightly wrong is recoverable; a thrown exception in the middle of
 * rendering a transcript is not.
 *
 * YouTube's `t` is expressed in whole seconds, and it seeks to the start of
 * the second, so truncating is what puts the viewer just before the first
 * word rather than just after it.
 */
export function deepLink(canonicalUrl: string, atMs: number): string {
  const seconds = Math.max(0, Math.floor(atMs / 1000));
  const separator = canonicalUrl.includes("?") ? "&" : "?";
  return `${canonicalUrl}${separator}t=${seconds}`;
}
