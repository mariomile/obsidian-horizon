import { compareDayKeys, monthGrid, parseDayKey } from '../dates.ts';
import { basenameToDate } from '../index/periodic.ts';
import type { MomentLike } from '../index/periodic.ts';
import type { DayKey } from '../types.ts';

const normalizeFolder = (folder: string): string => folder.replace(/\/+$/, '');

/** Resolve a file path to its daily DayKey, or null if it is not a daily note. */
export function resolveDailyKey(
  moment: MomentLike,
  folder: string,
  format: string,
  filePath: string,
): DayKey | null {
  if (!filePath.endsWith('.md')) return null;
  const slash = filePath.lastIndexOf('/');
  const fileFolder = slash === -1 ? '' : filePath.slice(0, slash);
  if (normalizeFolder(fileFolder) !== normalizeFolder(folder)) return null;
  const basename = filePath.slice(slash + 1, -3);
  return basenameToDate(moment, basename, format);
}

/** Human label for the pill, e.g. "21 Jul 2026". */
export function formatDayLabel(moment: MomentLike, key: DayKey): string {
  return moment(key, 'YYYY-MM-DD', true).format('D MMM YYYY');
}

export interface PickerCell {
  key: DayKey;
  inMonth: boolean;
  isToday: boolean;
  isCurrent: boolean;
  hasNote: boolean;
}

/** 42 cells for the month containing `anchor`, decorated for rendering. */
export function buildPickerCells(
  anchor: DayKey,
  opts: { currentKey: DayKey; todayKey: DayKey; hasNote: (key: DayKey) => boolean },
): PickerCell[] {
  const ymd = parseDayKey(anchor);
  if (!ymd) return [];
  const keys = monthGrid(ymd.y, ymd.m);
  return keys.map((key) => {
    const cell = parseDayKey(key);
    return {
      key,
      inMonth: cell?.m === ymd.m,
      isToday: compareDayKeys(key, opts.todayKey) === 0,
      isCurrent: compareDayKeys(key, opts.currentKey) === 0,
      hasNote: opts.hasNote(key),
    };
  });
}
