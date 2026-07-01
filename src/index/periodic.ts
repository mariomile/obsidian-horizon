import type { App, TFile } from 'obsidian';

import { dayKey, isValidDayKey } from '../dates.ts';
import type { DayKey, Period, PeriodConfig } from '../types.ts';

/**
 * The slice of moment.js Horizon needs. The real implementation is Obsidian's
 * bundled `moment` (imported from 'obsidian' at runtime); tests inject the
 * `moment` devDependency. Sources must never import 'moment' directly.
 */
export type MomentLike = (
  input: string,
  format: string,
  strict: boolean,
) => {
  isValid(): boolean;
  format(fmt: string): string;
  year(): number;
  month(): number;
  date(): number;
};

/** Format a DayKey into a periodic-note basename (no extension). */
export function dateToBasename(moment: MomentLike, key: DayKey, format: string): string {
  return moment(key, 'YYYY-MM-DD', true).format(format);
}

/**
 * Parse a basename back to a DayKey with a strict round-trip: the parsed value
 * re-formatted must equal the input. This rejects sync-conflict copies like
 * "25-06-2026 (Conflicted copy iPhone …)" that a lenient parse would accept.
 */
export function basenameToDate(
  moment: MomentLike,
  basename: string,
  format: string,
): DayKey | null {
  const parsed = moment(basename, format, true);
  if (!parsed.isValid()) return null;
  if (parsed.format(format) !== basename) return null;
  const key = dayKey(parsed.year(), parsed.month() + 1, parsed.date());
  return isValidDayKey(key) ? key : null;
}

export function dateToPath(moment: MomentLike, key: DayKey, config: PeriodConfig): string {
  const basename = dateToBasename(moment, key, config.format);
  const folder = config.folder.replace(/\/+$/, '');
  return folder === '' ? `${basename}.md` : `${folder}/${basename}.md`;
}

/** Thin vault adapter: existence lookups for periodic notes, per period. */
export class PeriodicService {
  private readonly app: App;
  private readonly moment: MomentLike;
  private readonly getConfig: (period: Period) => PeriodConfig;

  constructor(app: App, moment: MomentLike, getConfig: (period: Period) => PeriodConfig) {
    this.app = app;
    this.moment = moment;
    this.getConfig = getConfig;
  }

  config(period: Period): PeriodConfig {
    return this.getConfig(period);
  }

  pathFor(period: Period, key: DayKey): string {
    return dateToPath(this.moment, key, this.getConfig(period));
  }

  noteFor(period: Period, key: DayKey): TFile | null {
    const config = this.getConfig(period);
    if (!config.enabled) return null;
    return this.app.vault.getFileByPath(this.pathFor(period, key));
  }

  /** True when `path` is inside any enabled period folder and parses as that period. */
  isPeriodicPath(path: string): boolean {
    if (!path.endsWith('.md')) return false;
    const slash = path.lastIndexOf('/');
    const folder = slash === -1 ? '' : path.slice(0, slash);
    const basename = path.slice(slash + 1, -3);
    const periods: Period[] = ['daily', 'weekly', 'monthly', 'yearly'];
    return periods.some((period) => {
      const config = this.getConfig(period);
      if (!config.enabled) return false;
      if (config.folder.replace(/\/+$/, '') !== folder) return false;
      return basenameToDate(this.moment, basename, config.format) !== null;
    });
  }
}
