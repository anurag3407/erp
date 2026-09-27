/**
 * Institutional time handling.
 *
 * All date-bucketed logic (attendance days, leave ranges, ARS history,
 * timetable/instructional-day counting, report windows) must be computed in the
 * institution's local timezone — not the server's UTC clock. Using
 * `toISOString().split('T')[0]` keys an 02:00 IST class to the *previous* day,
 * which silently corrupts attendance percentages and eligibility.
 *
 * India observes a single fixed offset (no DST), but the helpers below use the
 * IANA zone so deployments in other regions remain correct.
 */

export const INSTITUTION_TIME_ZONE = process.env.INSTITUTION_TIME_ZONE || 'Asia/Kolkata';

const dateKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: INSTITUTION_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const offsetFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: INSTITUTION_TIME_ZONE,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** `YYYY-MM-DD` for an instant, in the institutional timezone. */
export function toIstDateKey(instant: Date | number = new Date()): string {
  const date = instant instanceof Date ? instant : new Date(instant);
  return dateKeyFormatter.format(date);
}

/** Offset (ms) between the given instant's local wall clock and UTC. */
function zoneOffsetMs(instant: Date): number {
  const parts = offsetFormatter.formatToParts(instant);
  const map: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = Number(part.value);
  }
  const hour = map.hour === 24 ? 0 : map.hour;
  const asUtc = Date.UTC(map.year, map.month - 1, map.day, hour, map.minute, map.second);
  return asUtc - instant.getTime();
}

/**
 * Convert a local date (+ optional time) in the institutional timezone to the
 * corresponding UTC instant. Two-pass offset resolution keeps wall-clock
 * arithmetic correct.
 */
export function zonedTimeToUtc(dateKey: string, time = '00:00:00'): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  const [hour, minute, second] = time.split(':').map(Number);
  const utcGuess = Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0);
  let timestamp = utcGuess - zoneOffsetMs(new Date(utcGuess));
  timestamp = utcGuess - zoneOffsetMs(new Date(timestamp));
  return new Date(timestamp);
}

/** Start-of-day and end-of-day (exclusive) UTC instants for a local date key. */
export function istDayRange(dateKey: string): { start: Date; endExclusive: Date } {
  return {
    start: zonedTimeToUtc(dateKey, '00:00:00'),
    endExclusive: zonedTimeToUtc(addDaysToDateKey(dateKey, 1), '00:00:00'),
  };
}

/** Add (or subtract) whole days to a `YYYY-MM-DD` key. Date-only math is zone-free. */
export function addDaysToDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Inclusive list of date keys between two `YYYY-MM-DD` keys. */
export function enumerateDateKeys(startKey: string, endKey: string): string[] {
  const keys: string[] = [];
  if (startKey > endKey) return keys;
  let current = startKey;
  // Guard against unbounded loops on corrupt input.
  let guard = 0;
  while (current <= endKey && guard < 3660) {
    keys.push(current);
    current = addDaysToDateKey(current, 1);
    guard += 1;
  }
  return keys;
}

/** Whether a `YYYY-MM-DD` key falls within an inclusive range (lexicographic compare is safe for ISO keys). */
export function isDateKeyInRange(dateKey: string, startKey: string, endKey: string): boolean {
  return dateKey >= startKey && dateKey <= endKey;
}

/** Whole days between two date keys (b - a). */
export function daysBetweenDateKeys(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

/** Whole-day difference between two instants measured in institutional days. */
export function istDaysBetween(a: Date | number, b: Date | number): number {
  return daysBetweenDateKeys(toIstDateKey(a), toIstDateKey(b));
}
