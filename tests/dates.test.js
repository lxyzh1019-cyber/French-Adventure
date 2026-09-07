import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FAMILY_TIME_ZONE, dateKeyOf, todayKey, addDaysToKey, dateKeyAddDays,
  weekStartOf, getWeekStart, isSameWeek, getIsoDateRange,
  previousWeekStartKey, weekStartForOffset, weekEndFromStart, formatWeekRange,
  weekdayIndex, toDateKey, daysBetweenKeys,
} from '../src/util/dates.js';

test('the family timezone is Edmonton, not the device', () => {
  assert.equal(FAMILY_TIME_ZONE, 'America/Edmonton');
});

test('an instant maps to the Edmonton calendar day, not the UTC one', () => {
  // 2026-01-15 23:30 Edmonton (MST, UTC-7) is already 2026-01-16 in UTC.
  // The old todayKey/backup-key split disagreed exactly here.
  assert.equal(dateKeyOf(new Date('2026-01-16T06:30:00Z')), '2026-01-15');
  // 00:30 Edmonton the next morning is 07:30 UTC, still the 16th both ways.
  assert.equal(dateKeyOf(new Date('2026-01-16T07:30:00Z')), '2026-01-16');
});

test('Edmonton midnight is the day boundary', () => {
  assert.equal(dateKeyOf(new Date('2026-01-16T06:59:59Z')), '2026-01-15'); // 23:59:59 MST
  assert.equal(dateKeyOf(new Date('2026-01-16T07:00:00Z')), '2026-01-16'); // 00:00:00 MST
});

test('day keys are correct across both daylight-saving transitions', () => {
  // Spring forward: 2026-03-08, MST(-7) -> MDT(-6) at 02:00 local.
  assert.equal(dateKeyOf(new Date('2026-03-08T06:59:00Z')), '2026-03-07'); // 23:59 MST
  assert.equal(dateKeyOf(new Date('2026-03-08T07:01:00Z')), '2026-03-08'); // 00:01 MST
  assert.equal(dateKeyOf(new Date('2026-03-09T05:59:00Z')), '2026-03-08'); // 23:59 MDT
  assert.equal(dateKeyOf(new Date('2026-03-09T06:01:00Z')), '2026-03-09'); // 00:01 MDT

  // Fall back: 2026-11-01, MDT(-6) -> MST(-7) at 02:00 local.
  assert.equal(dateKeyOf(new Date('2026-11-01T05:59:00Z')), '2026-10-31'); // 23:59 MDT
  assert.equal(dateKeyOf(new Date('2026-11-01T06:01:00Z')), '2026-11-01'); // 00:01 MDT
  assert.equal(dateKeyOf(new Date('2026-11-02T06:59:00Z')), '2026-11-01'); // 23:59 MST
  assert.equal(dateKeyOf(new Date('2026-11-02T07:01:00Z')), '2026-11-02'); // 00:01 MST
});

test('the same instant yields the same key whatever the device timezone', () => {
  // The whole point: an iPad set to Tokyo, London or an outright wrong zone
  // must still agree with an iPad in Edmonton about what day it is.
  const instant = new Date('2026-01-16T06:30:00Z');   // 23:30 in Edmonton
  const zones = ['America/Edmonton','UTC','Asia/Tokyo','Europe/London','Pacific/Kiritimati'];

  const ours = zones.map(() => dateKeyOf(instant));
  assert.deepEqual([...new Set(ours)], ['2026-01-15']);

  // Contrast: the old device-local approach genuinely disagrees for the same
  // instant, which is the defect these keys exist to remove.
  const naive = zones.map(tz => {
    const d = new Intl.DateTimeFormat('en-CA',
      { timeZone: tz, year:'numeric', month:'2-digit', day:'2-digit' }).format(instant);
    return d;
  });
  assert.ok(new Set(naive).size > 1,
    'expected device-local keys to disagree across timezones');
  assert.deepEqual(naive[0], '2026-01-15');            // Edmonton
  assert.deepEqual(naive[2], '2026-01-16');            // Tokyo, already tomorrow
});

test('day arithmetic steps whole calendar days, including across DST', () => {
  assert.equal(addDaysToKey('2026-01-15', 1), '2026-01-16');
  assert.equal(addDaysToKey('2026-01-15', -1), '2026-01-14');
  assert.equal(addDaysToKey('2026-01-31', 1), '2026-02-01');
  assert.equal(addDaysToKey('2026-12-31', 1), '2027-01-01');
  assert.equal(addDaysToKey('2028-02-28', 1), '2028-02-29');   // leap year
  assert.equal(addDaysToKey('2026-03-07', 1), '2026-03-08');   // spring forward
  assert.equal(addDaysToKey('2026-10-31', 1), '2026-11-01');   // fall back
  assert.equal(addDaysToKey('2026-01-15', 0), '2026-01-15');
});

test('weeks start on Monday', () => {
  assert.equal(weekStartOf('2026-01-15'), '2026-01-12'); // Thu -> Mon
  assert.equal(weekStartOf('2026-01-12'), '2026-01-12'); // Mon -> itself
  assert.equal(weekStartOf('2026-01-18'), '2026-01-12'); // Sun -> previous Mon
  assert.equal(weekStartOf('2026-01-19'), '2026-01-19'); // next Mon
});

test('Sunday-to-Monday rollover moves to a new week exactly once', () => {
  const sunday = weekStartOf('2026-01-18');
  const monday = weekStartOf('2026-01-19');
  assert.notEqual(sunday, monday);
  assert.equal(addDaysToKey(sunday, 7), monday);
});

test('week helpers compose consistently', () => {
  const start = getWeekStart();
  assert.equal(weekEndFromStart(start), addDaysToKey(start, 6));
  assert.equal(previousWeekStartKey(start), addDaysToKey(start, -7));
  assert.equal(weekStartForOffset(0), start);
  assert.equal(weekStartForOffset(-1), previousWeekStartKey(start));
  assert.equal(weekStartOf(weekEndFromStart(start)), start);
});

test('getIsoDateRange is inclusive and contiguous', () => {
  assert.deepEqual(getIsoDateRange('2026-01-15','2026-01-18'),
    ['2026-01-15','2026-01-16','2026-01-17','2026-01-18']);
  assert.deepEqual(getIsoDateRange('2026-01-15','2026-01-15'), ['2026-01-15']);
  assert.deepEqual(getIsoDateRange('2026-01-18','2026-01-15'), []);   // reversed
  assert.deepEqual(getIsoDateRange(null,'2026-01-15'), []);
  assert.equal(getIsoDateRange('2026-03-06','2026-03-10').length, 5); // across DST
});

test('a full week range is exactly seven days', () => {
  const s = weekStartOf('2026-03-08');   // the DST week
  assert.equal(getIsoDateRange(s, weekEndFromStart(s)).length, 7);
});

test('formatWeekRange reads as a human date range', () => {
  assert.equal(formatWeekRange('2026-01-12'), 'Jan 12 - Jan 18');
  assert.equal(formatWeekRange('2026-12-28'), 'Dec 28 - Jan 3');   // across new year
});

test('isSameWeek treats a missing timestamp as current, never wiping', () => {
  assert.equal(isSameWeek(null), true);
  assert.equal(isSameWeek(undefined), true);
  assert.equal(isSameWeek(''), true);
  assert.equal(isSameWeek(getWeekStart()), true);
  assert.equal(isSameWeek(previousWeekStartKey(getWeekStart())), false);
});

test('todayKey agrees with dateKeyOf(now) and is well formed', () => {
  assert.match(todayKey(), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(todayKey(), dateKeyOf(new Date()));
  assert.equal(dateKeyAddDays(0), todayKey());
  assert.equal(dateKeyAddDays(1), addDaysToKey(todayKey(), 1));
});

test('weekdayIndex uses the Edmonton day, not the device day', () => {
  // 2026-01-16T06:30Z is Thursday 23:30 in Edmonton but already Friday in UTC.
  assert.equal(weekdayIndex(new Date('2026-01-16T06:30:00Z')), 4); // Thu
  assert.equal(weekdayIndex(new Date('2026-01-16T07:30:00Z')), 5); // Fri
  assert.equal(weekdayIndex(new Date('2026-01-18T12:00:00Z')), 0); // Sun
});

test('toDateKey accepts current keys and legacy toDateString values', () => {
  // An existing profile stores lastPlayed as "Sat Sep 06 2026". If that no
  // longer parsed, every learner would silently lose their streak on upgrade.
  assert.equal(toDateKey('2026-09-06'), '2026-09-06');
  assert.equal(toDateKey('Sat Sep 06 2026'), '2026-09-06');
  assert.equal(toDateKey('Thu Jan 15 2026'), '2026-01-15');
  assert.equal(toDateKey(null), null);
  assert.equal(toDateKey(''), null);
  assert.equal(toDateKey('not a date'), null);
});

test('daysBetweenKeys counts whole days and survives DST', () => {
  assert.equal(daysBetweenKeys('2026-01-15','2026-01-16'), 1);
  assert.equal(daysBetweenKeys('2026-01-15','2026-01-15'), 0);
  assert.equal(daysBetweenKeys('2026-01-16','2026-01-15'), -1);
  assert.equal(daysBetweenKeys('2026-03-07','2026-03-09'), 2);  // spring forward
  assert.equal(daysBetweenKeys('2026-10-31','2026-11-02'), 2);  // fall back
});

test('a streak survives the change of lastPlayed format', () => {
  // Played yesterday, stored in the legacy format: must not reset (diff = 1).
  const yesterday = addDaysToKey(todayKey(), -1);
  const legacy = new Date(yesterday + 'T12:00:00Z').toDateString();
  assert.equal(daysBetweenKeys(toDateKey(legacy), todayKey()), 1);
  // Played three days ago: must reset (diff > 1).
  const old = addDaysToKey(todayKey(), -3);
  assert.ok(daysBetweenKeys(toDateKey(old), todayKey()) > 1);
});
