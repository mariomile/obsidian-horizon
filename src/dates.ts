import type { DayKey } from './types.ts';
import { addDays, dayKey, mustParse, type Ymd } from './kit/daykey.ts';

// Day-key core condiviso via marioverse-kit (vendored in src/kit/daykey.ts).
export {
  addDays,
  addMonths,
  compareDayKeys,
  dayKey,
  daysInMonth,
  isValidDayKey,
  mustParse,
  parseDayKey,
  todayKey,
  type Ymd,
} from './kit/daykey.ts';

const MS_PER_DAY = 86_400_000;

function toDate({ y, m, d }: Ymd): Date {
  return new Date(y, m - 1, d);
}

/** ISO weekday: Monday = 1 … Sunday = 7. */
function isoWeekday(key: DayKey): number {
  return ((toDate(mustParse(key)).getDay() + 6) % 7) + 1;
}

export function startOfWeekMonday(key: DayKey): DayKey {
  return addDays(key, 1 - isoWeekday(key));
}

/** The Monday strictly after `key` (a Monday input yields the following week's). */
export function nextMonday(key: DayKey): DayKey {
  return addDays(key, 8 - isoWeekday(key));
}

export function weekDays(key: DayKey): DayKey[] {
  const monday = startOfWeekMonday(key);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** ISO 8601 week number and week-year (the Thursday of the week decides the year). */
export function isoWeek(key: DayKey): { year: number; week: number } {
  const thursdayKey = addDays(key, 4 - isoWeekday(key));
  const thursday = toDate(mustParse(thursdayKey));
  const year = thursday.getFullYear();
  const jan1 = new Date(year, 0, 1);
  // Round kills the ±1h residue a DST transition leaves in the difference.
  const days = Math.round((thursday.getTime() - jan1.getTime()) / MS_PER_DAY);
  return { year, week: Math.floor(days / 7) + 1 };
}

/** 42 consecutive days (6 weeks) starting from the Monday on or before the 1st of the month. */
export function monthGrid(y: number, m: number): DayKey[] {
  const first = startOfWeekMonday(dayKey(y, m, 1));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}
