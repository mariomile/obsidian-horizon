import { addDays, isoWeek, startOfWeekMonday } from '../dates.ts';
import type { MomentLike } from '../index/periodic.ts';
import type { DayKey } from '../types.ts';

/** Heading for the week panel, e.g. "W32 · 3 Aug – 9 Aug". Accepts any day inside the week. */
export function weeklyHeading(moment: MomentLike, key: DayKey): string {
  const monday = startOfWeekMonday(key);
  const sunday = addDays(monday, 6);
  const { week } = isoWeek(monday);
  const from = moment(monday, 'YYYY-MM-DD', true).format('D MMM');
  const to = moment(sunday, 'YYYY-MM-DD', true).format('D MMM');
  return `W${week} · ${from} – ${to}`;
}
