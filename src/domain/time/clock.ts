/**
 * Render a position in a video as a clock reading a human can match against
 * a player's timeline: `7:11` for anything under an hour, `1:21:33` above it.
 *
 * Hours are omitted rather than zero-padded because a leading `0:` reads as
 * noise on the overwhelmingly common case, and this string is repeated once
 * per paragraph.
 */
export function formatClock(totalSeconds: number): string {
  const total = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  const ss = String(seconds).padStart(2, "0");

  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
