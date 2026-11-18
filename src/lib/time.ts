/** "vor 5 Min." style durations in German, relative to now. */
export function relative(iso: string | null, now: number): string {
  if (!iso) return '–';
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms)) return '–';
  const future = ms < 0,
    minutes = Math.floor(Math.abs(ms) / 60000);
  const text =
    minutes < 1
      ? 'weniger als 1 Min.'
      : minutes < 60
        ? `${minutes} Min.`
        : minutes < 48 * 60
          ? `${Math.floor(minutes / 60)} Std.`
          : `${Math.floor(minutes / 1440)} Tagen`;
  if (minutes < 1) return future ? 'gleich' : 'gerade eben';
  return future ? `in ${text}` : `vor ${text}`;
}
/** Local clock time (Europe/Berlin) of an ISO timestamp. */
export function clock(iso: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}
