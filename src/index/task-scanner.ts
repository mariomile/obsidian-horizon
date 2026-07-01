import type { App, TFile } from 'obsidian';

import { parseTaskLine } from './task-line.ts';
import type { TaskEntry } from '../types.ts';

/** The subset of Obsidian's ListItemCache the scanner needs. */
export interface TaskListItem {
  line: number;
  task: string;
}

/**
 * Pure core: extract date-carrying tasks from file content.
 * The index is day-keyed, so tasks without any date are skipped.
 */
export function extractTasks(
  path: string,
  content: string,
  listItems: TaskListItem[],
): TaskEntry[] {
  if (listItems.length === 0) return [];
  const lines = content.split('\n');
  const entries: TaskEntry[] = [];
  for (const item of listItems) {
    const raw = lines[item.line];
    if (raw === undefined) continue;
    const parsed = parseTaskLine(raw);
    if (!parsed) continue;
    if (!parsed.due && !parsed.scheduled && !parsed.doneDate && !parsed.cancelledDate) continue;
    entries.push({
      path,
      line: item.line,
      rawText: raw,
      description: parsed.description,
      status: parsed.status,
      done: parsed.done,
      recurring: parsed.recurring,
      due: parsed.due,
      scheduled: parsed.scheduled,
      doneDate: parsed.doneDate,
      cancelledDate: parsed.cancelledDate,
    });
  }
  return entries;
}

/** Thin adapter: cache lookup + read, delegating to the pure core. */
export function taskListItems(app: App, file: TFile): TaskListItem[] {
  const items = app.metadataCache.getFileCache(file)?.listItems ?? [];
  return items
    .filter((item) => item.task !== undefined)
    .map((item) => ({ line: item.position.start.line, task: item.task as string }));
}

export async function scanFileTasks(app: App, file: TFile): Promise<TaskEntry[]> {
  const items = taskListItems(app, file);
  if (items.length === 0) return [];
  const content = await app.vault.cachedRead(file);
  return extractTasks(file.path, content, items);
}
