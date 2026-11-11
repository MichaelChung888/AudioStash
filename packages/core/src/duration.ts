// 185_000 -> "3:05", 3_723_000 -> "1:02:03"
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${ss}` : `${minutes}:${ss}`;
}

// For playlist totals: "45 min", "2 hr 5 min".
export function formatTotalDuration(ms: number): string {
  const totalMinutes = Math.round(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}

// ISO 8601 durations as YouTube returns them: "PT3M5S" -> 185, "PT1H2M3S" -> 3723.
export function parseIsoDuration(value: string): number | null {
  const match = value.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!match || value === 'P' || value === 'PT') return null;
  const [, days, hours, minutes, seconds] = match;
  return Number(days ?? 0) * 86_400 + Number(hours ?? 0) * 3600 + Number(minutes ?? 0) * 60 + Number(seconds ?? 0);
}
