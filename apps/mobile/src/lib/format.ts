const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Decimal units, as Android's storage settings show them. Each unit is chosen after rounding,
// so 999.6 MB shows as "1 GB", not "1000 MB". Number() drops a trailing ".0": "2 GB", not "2.0 GB".
export function formatBytes(bytes: number): string {
  const kb = Math.max(0, Math.round(bytes / 1e3));
  if (kb < 1000) return `${kb} KB`;
  const mb = Math.round(bytes / 1e6);
  if (mb < 1000) return `${mb} MB`;
  return `${Number((bytes / 1e9).toFixed(1))} GB`;
}

// "14 Mar 2026", in the phone's time zone.
export function formatDate(iso: string): string {
  const date = new Date(iso);
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatAgo(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return `${seconds} s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  return formatDate(iso);
}

// "45 mins", "1 hr 52 mins", "278 hrs". For a playlist's total length.
// From 10 hours the minutes are left out: they add little, and the text must fit a narrow stat tile.
export function formatCompactDuration(ms: number): string {
  const totalMinutes = Math.round(ms / 60_000);
  if (totalMinutes < 60) return plural(totalMinutes, 'min');
  if (totalMinutes >= 600) return plural(Math.round(totalMinutes / 60), 'hr');
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? plural(hours, 'hr') : `${plural(hours, 'hr')} ${plural(minutes, 'min')}`;
}

const COUNT_UNITS = ['K', 'M', 'B'] as const;

// "999", "58.9K", "123K", "5.2M": one decimal below 100. As in formatBytes, the unit is
// chosen after rounding, so 999,960 shows as "1M", not "1000K".
export function formatCount(count: number): string {
  if (count < 1000) return String(count);
  const round = (value: number) => Number(value.toFixed(value < 100 ? 1 : 0));
  let value = count;
  let unit = '';
  for (const next of COUNT_UNITS) {
    value /= 1000;
    unit = next;
    if (round(value) < 1000) break;
  }
  return `${round(value)}${unit}`;
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
