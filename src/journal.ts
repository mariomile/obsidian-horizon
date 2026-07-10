import { basenameToDate, type MomentLike } from './index/periodic.ts';
import { stripFrontmatter } from './preview.ts';
import type { DayKey, PeriodConfig } from './types.ts';

export interface DailyFileLike {
  path: string;
  basename: string;
}

export interface JournalEntry<TFile extends DailyFileLike = DailyFileLike> {
  file: TFile;
  key: DayKey;
}

/**
 * Keep only real daily notes from the configured folder and filename format.
 * Invalid/sync-conflict filenames are deliberately ignored by the strict parser.
 */
export function listJournalEntries<TFile extends DailyFileLike>(
  files: readonly TFile[],
  config: PeriodConfig,
  moment: MomentLike,
  through: DayKey,
): JournalEntry<TFile>[] {
  if (!config.enabled) return [];
  const folder = config.folder.replace(/\/+$/, '');
  const entries: JournalEntry<TFile>[] = [];

  for (const file of files) {
    const slash = file.path.lastIndexOf('/');
    const fileFolder = slash === -1 ? '' : file.path.slice(0, slash);
    if (fileFolder !== folder) continue;
    const key = basenameToDate(moment, file.basename, config.format);
    if (key === null || key > through) continue;
    entries.push({ file, key });
  }

  return entries.sort((a, b) => b.key.localeCompare(a.key));
}

/** Markdown suitable for a fast, text-first reader: no metadata or heavy embeds. */
export function cleanJournalMarkdown(markdown: string): string {
  return stripFrontmatter(markdown)
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^!\[\[[^\]]+\]\]\s*$/gm, '')
    .replace(/^!\[[^\]]*\]\([^)]+\)\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface JournalPreview {
  markdown: string;
  truncated: boolean;
}

/** Truncate between Markdown lines so the preview never cuts through a block. */
export function createJournalPreview(markdown: string, maxCharacters: number): JournalPreview {
  const cleaned = cleanJournalMarkdown(markdown);
  if (cleaned.length <= maxCharacters) return { markdown: cleaned, truncated: false };

  const lines = cleaned.split('\n');
  const preview: string[] = [];
  let length = 0;
  for (const line of lines) {
    const nextLength = length + (preview.length > 0 ? 1 : 0) + line.length;
    if (nextLength > maxCharacters && preview.length > 0) break;
    preview.push(line);
    length = nextLength;
  }

  return { markdown: preview.join('\n').trim(), truncated: true };
}
