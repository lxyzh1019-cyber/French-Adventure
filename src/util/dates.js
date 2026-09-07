// Date and week helpers.
//
// Every function here returns a YYYY-MM-DD key in the family's own timezone,
// America/Edmonton, regardless of what the device clock is set to.
//
// Three different definitions of "a day" used to coexist: todayKey and
// getWeekStart used the device's local calendar, the daily Firestore backup
// sliced toISOString (UTC), and the week helpers built local midnight then read
// it back through toISOString (off by one east of UTC). Two iPads in different
// timezones — or one iPad with the wrong clock — would disagree about what
// "today" is, which corrupts daily round caps, streaks, and round-draft resume.
//
// Using the IANA zone rather than a fixed offset means the two annual
// daylight-saving transitions are handled by the platform, not by us.

export const FAMILY_TIME_ZONE = 'America/Edmonton';

// en-CA formats as YYYY-MM-DD, which is exactly the key format used throughout.
const keyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: FAMILY_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});

/** The YYYY-MM-DD key for an instant, in the family's timezone. */
export function dateKeyOf(date = new Date()) {
  return keyFormatter.format(date);
}

/** Today's date key in the family's timezone. */
export function todayKey() {
  return dateKeyOf(new Date());
}

// Keys are plain calendar dates, so arithmetic on them is done with a UTC
// anchor. That keeps day-stepping exact and free of DST hour shifts — the
// timezone only matters when deciding which calendar day an *instant* is.
function keyToUTC(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function utcToKey(date) {
  return date.toISOString().slice(0, 10);
}

/** Shift a date key by whole days. */
export function addDaysToKey(key, delta) {
  const d = keyToUTC(key);
  d.setUTCDate(d.getUTCDate() + delta);
  return utcToKey(d);
}

/** Today's key shifted by whole days. */
export function dateKeyAddDays(delta) {
  return addDaysToKey(todayKey(), delta);
}

/** Monday of the week containing `key` (or of the current week). */
export function weekStartOf(key = todayKey()) {
  const d = keyToUTC(key);
  const day = d.getUTCDay();               // 0=Sun … 6=Sat
  d.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1));
  return utcToKey(d);
}

/** Monday of the current week, in the family's timezone. */
export function getWeekStart() {
  return weekStartOf(todayKey());
}

export function isSameWeek(ts) {
  if (!ts) return true;      // null/missing = treat as current week, never auto-wipe
  return ts >= getWeekStart();
}

export function getIsoDateRange(startKey, endKey) {
  if (!startKey || !endKey) return [];
  const out = [];
  for (let k = startKey; k <= endKey; k = addDaysToKey(k, 1)) out.push(k);
  return out;
}

export function previousWeekStartKey(baseWeekStart) {
  return addDaysToKey(baseWeekStart || getWeekStart(), -7);
}

export function weekStartForOffset(offset) {
  return addDaysToKey(getWeekStart(), offset * 7);
}

export function weekEndFromStart(startKey) {
  return addDaysToKey(startKey, 6);
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function formatWeekRange(startKey) {
  const s = keyToUTC(startKey);
  const e = keyToUTC(weekEndFromStart(startKey));
  return MONTHS[s.getUTCMonth()] + ' ' + s.getUTCDate()
       + ' - ' + MONTHS[e.getUTCMonth()] + ' ' + e.getUTCDate();
}

const weekdayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: FAMILY_TIME_ZONE, weekday: 'short',
});
const WEEKDAY_INDEX = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };

/** Day of week in the family's timezone: 0=Sunday … 6=Saturday. */
export function weekdayIndex(date = new Date()) {
  return WEEKDAY_INDEX[weekdayFormatter.format(date)];
}

/**
 * Coerce a stored "last played" value into a date key.
 *
 * Accepts current YYYY-MM-DD keys and the legacy Date#toDateString() values
 * ("Sat Sep 06 2026") written before day keys were unified, so an existing
 * profile keeps its streak instead of silently resetting on upgrade.
 *
 * A legacy value names a calendar date with no time of day, so it is read
 * directly rather than parsed into an instant and converted — going through
 * an instant would shift it a day whenever the runtime's zone is east of
 * Edmonton, quietly rewriting every learner's history by one day.
 */
export function toDateKey(value) {
  if (!value) return null;
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  const m = str.match(/^[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})$/);
  if (m) {
    const month = MONTHS.indexOf(m[1]);
    if (month >= 0) {
      return `${m[3]}-${String(month + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
    }
  }

  const parsed = new Date(str);
  return Number.isNaN(parsed.getTime()) ? null : dateKeyOf(parsed);
}

/** Whole days from one date key to another. Negative if `to` is earlier. */
export function daysBetweenKeys(from, to) {
  return Math.round((keyToUTC(to) - keyToUTC(from)) / 86400000);
}
