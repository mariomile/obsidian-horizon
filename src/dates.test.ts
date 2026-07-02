import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  addDays,
  addMonths,
  compareDayKeys,
  dayKey,
  daysInMonth,
  isoWeek,
  isValidDayKey,
  monthGrid,
  nextMonday,
  parseDayKey,
  startOfWeekMonday,
  todayKey,
  weekDays,
} from './dates.ts';

describe('dayKey / parseDayKey', () => {
  it('formats with zero padding', () => {
    assert.equal(dayKey(2026, 7, 2), '2026-07-02');
    assert.equal(dayKey(2026, 11, 30), '2026-11-30');
  });

  it('round-trips through parse', () => {
    assert.deepEqual(parseDayKey('2026-07-02'), { y: 2026, m: 7, d: 2 });
  });

  it('rejects malformed and impossible dates', () => {
    assert.equal(parseDayKey('2026-05-0'), null);
    assert.equal(parseDayKey('2026-13-01'), null);
    assert.equal(parseDayKey('2026-02-30'), null);
    assert.equal(parseDayKey('02-07-2026'), null);
    assert.equal(parseDayKey('garbage'), null);
    assert.equal(parseDayKey(''), null);
  });

  it('accepts leap-day only on leap years', () => {
    assert.deepEqual(parseDayKey('2028-02-29'), { y: 2028, m: 2, d: 29 });
    assert.equal(parseDayKey('2026-02-29'), null);
  });

  it('isValidDayKey mirrors parseDayKey', () => {
    assert.equal(isValidDayKey('2026-07-02'), true);
    assert.equal(isValidDayKey('2026-05-0'), false);
  });
});

describe('todayKey', () => {
  it('uses local time, not UTC', () => {
    // 00:30 local on Jul 2 — a UTC-based implementation would drift to Jul 1
    // in any timezone ahead of UTC (e.g. Europe/Rome).
    const now = new Date(2026, 6, 2, 0, 30);
    assert.equal(todayKey(now), '2026-07-02');
  });
});

describe('addDays / addMonths', () => {
  it('crosses month and year boundaries', () => {
    assert.equal(addDays('2026-07-31', 1), '2026-08-01');
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  });

  it('is stable across DST transitions', () => {
    // Europe DST switch: 2026-03-29 and 2026-10-25.
    assert.equal(addDays('2026-03-28', 1), '2026-03-29');
    assert.equal(addDays('2026-03-29', 1), '2026-03-30');
    assert.equal(addDays('2026-10-24', 2), '2026-10-26');
  });

  it('addMonths clamps the day to the target month length', () => {
    assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
    assert.equal(addMonths('2028-01-31', 1), '2028-02-29');
    assert.equal(addMonths('2026-03-31', -1), '2026-02-28');
    assert.equal(addMonths('2026-12-15', 1), '2027-01-15');
  });
});

describe('daysInMonth', () => {
  it('knows month lengths and leap years', () => {
    assert.equal(daysInMonth(2026, 2), 28);
    assert.equal(daysInMonth(2028, 2), 29);
    assert.equal(daysInMonth(2026, 4), 30);
    assert.equal(daysInMonth(2026, 12), 31);
  });
});

describe('startOfWeekMonday / weekDays', () => {
  it('returns the same day for a Monday', () => {
    assert.equal(startOfWeekMonday('2026-06-29'), '2026-06-29'); // Monday
  });

  it('goes back to Monday from any weekday', () => {
    assert.equal(startOfWeekMonday('2026-07-02'), '2026-06-29'); // Thursday
    assert.equal(startOfWeekMonday('2026-07-05'), '2026-06-29'); // Sunday
  });

  it('weekDays returns 7 consecutive days from Monday', () => {
    const days = weekDays('2026-07-02');
    assert.equal(days.length, 7);
    assert.equal(days[0], '2026-06-29');
    assert.equal(days[6], '2026-07-05');
  });
});

describe('isoWeek', () => {
  it('computes plain mid-year weeks', () => {
    assert.deepEqual(isoWeek('2026-07-02'), { year: 2026, week: 27 });
    assert.deepEqual(isoWeek('2026-04-06'), { year: 2026, week: 15 }); // matches Journal/Weekly/2026-W15
  });

  it('assigns end-of-December days to week 1 of the next year', () => {
    assert.deepEqual(isoWeek('2024-12-30'), { year: 2025, week: 1 });
    assert.deepEqual(isoWeek('2024-12-31'), { year: 2025, week: 1 });
  });

  it('assigns early-January days to the last week of the previous year', () => {
    assert.deepEqual(isoWeek('2027-01-01'), { year: 2026, week: 53 });
    assert.deepEqual(isoWeek('2027-01-03'), { year: 2026, week: 53 });
    assert.deepEqual(isoWeek('2027-01-04'), { year: 2027, week: 1 }); // first Monday of 2027
  });

  it('handles week 53 years', () => {
    assert.deepEqual(isoWeek('2026-12-31'), { year: 2026, week: 53 });
  });
});

describe('monthGrid', () => {
  it('always returns 42 cells starting on Monday', () => {
    const grid = monthGrid(2026, 7);
    assert.equal(grid.length, 42);
    assert.equal(grid[0], '2026-06-29'); // Monday before Jul 1 (Wednesday)
    assert.equal(grid[41], '2026-08-09');
    assert.ok(grid.includes('2026-07-01'));
    assert.ok(grid.includes('2026-07-31'));
  });

  it('starts on the 1st when the month begins on Monday', () => {
    const grid = monthGrid(2026, 6); // 2026-06-01 is a Monday
    assert.equal(grid[0], '2026-06-01');
    assert.equal(grid.length, 42);
  });

  it('covers February of a non-leap year without gaps', () => {
    const grid = monthGrid(2027, 2); // 2027-02-01 is a Monday
    assert.equal(grid[0], '2027-02-01');
    assert.ok(grid.includes('2027-02-28'));
    // consecutive days throughout
    for (let i = 1; i < grid.length; i++) {
      assert.equal(grid[i], addDays(grid[i - 1] ?? '', 1));
    }
  });
});

describe('nextMonday', () => {
  it('returns the strictly next Monday', () => {
    assert.equal(nextMonday('2026-07-02'), '2026-07-06'); // Thursday → next Monday
    assert.equal(nextMonday('2026-07-05'), '2026-07-06'); // Sunday → next day
  });

  it('skips a full week when starting on Monday', () => {
    assert.equal(nextMonday('2026-06-29'), '2026-07-06');
  });
});

describe('compareDayKeys', () => {
  it('orders lexicographically equal to chronologically', () => {
    assert.ok(compareDayKeys('2026-07-01', '2026-07-02') < 0);
    assert.ok(compareDayKeys('2026-07-02', '2026-07-02') === 0);
    assert.ok(compareDayKeys('2027-01-01', '2026-12-31') > 0);
  });
});
