import type { App, TFile } from 'obsidian';

import { isValidDayKey } from '../dates.ts';
import type { DayKey } from '../types.ts';

const ISO_DATE_PREFIX_RE = /^(\d{4}-\d{2}-\d{2})(?:[T\s].*)?$/;

/** Pure core: normalize an unknown frontmatter `date` value to a DayKey. */
export function normalizeFrontmatterDate(value: unknown): DayKey | null {
  if (typeof value !== 'string') return null;
  const match = ISO_DATE_PREFIX_RE.exec(value.trim());
  const day = match?.[1];
  return day !== undefined && isValidDayKey(day) ? day : null;
}

/** Thin adapter: read the `date` property from the metadata cache. */
export function readFrontmatterDate(app: App, file: TFile): DayKey | null {
  const value: unknown = app.metadataCache.getFileCache(file)?.frontmatter?.date;
  return normalizeFrontmatterDate(value);
}
