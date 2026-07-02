import type { App, TFile } from 'obsidian';

import { dayKey, isValidDayKey } from '../dates.ts';
import type { DayKey } from '../types.ts';

export interface FrontmatterDate {
  day: DayKey;
  time: string | null;
}

const ISO_DATE_RE = /^(\d{4}-\d{2}-\d{2})([T\s].*)?$/;
const TIME_SUFFIX_RE = /^[T\s](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?\s*$/;
const OFFSET_RE = /(?:Z|[+-]\d{2}:?\d{2})\s*$/;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Pure core: normalize an unknown frontmatter date value.
 * - Naive datetimes keep their written wall-clock time.
 * - Datetimes with an explicit offset (Granola writes `...Z` UTC) are converted
 *   to the LOCAL day and time — both can differ from the written ones.
 * - Invalid time suffixes drop to null; the day (when valid) survives.
 */
export function normalizeFrontmatterDate(value: unknown): FrontmatterDate | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const match = ISO_DATE_RE.exec(trimmed);
  const day = match?.[1];
  if (day === undefined || !isValidDayKey(day)) return null;
  const suffix = match?.[2];
  if (suffix === undefined) return { day, time: null };

  if (OFFSET_RE.test(suffix)) {
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return { day, time: null };
    return {
      day: dayKey(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate()),
      time: `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`,
    };
  }

  const timeMatch = TIME_SUFFIX_RE.exec(suffix);
  if (!timeMatch) return { day, time: null };
  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);
  if (hours > 23 || minutes > 59) return { day, time: null };
  return { day, time: `${timeMatch[1]}:${timeMatch[2]}` };
}

/** Thin adapter: read the `date` property from the metadata cache. */
export function readFrontmatterDate(app: App, file: TFile): FrontmatterDate | null {
  const value: unknown = app.metadataCache.getFileCache(file)?.frontmatter?.date;
  return normalizeFrontmatterDate(value);
}
