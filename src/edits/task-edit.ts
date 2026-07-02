import { Notice } from 'obsidian';

import { todayKey } from '../dates.ts';
import { parseTaskLine, rewriteDate, toggleDone } from '../index/task-line.ts';
import type { DayKey, TaskDateKind } from '../types.ts';
import type { HorizonContext } from '../ui/context.ts';
import { applyLineEdit } from './line-edit.ts';
import type { LineRef } from './line-edit.ts';

export interface TaskRef extends LineRef {
  path: string;
}

async function editTaskLine(
  ctx: HorizonContext,
  ref: TaskRef,
  transform: (line: string) => string,
): Promise<boolean> {
  const file = ctx.app.vault.getFileByPath(ref.path);
  if (!file) {
    new Notice('Horizon: file non trovato.');
    return false;
  }
  let changed = false;
  await ctx.app.vault.process(file, (content) => {
    const result = applyLineEdit(content, ref, transform);
    changed = result.changed;
    return result.content;
  });
  if (!changed) {
    new Notice('Horizon: il task è cambiato nel frattempo — riprova.');
  }
  return changed;
}

async function openAtLine(ctx: HorizonContext, ref: TaskRef): Promise<void> {
  const file = ctx.app.vault.getFileByPath(ref.path);
  if (!file) return;
  await ctx.app.workspace.getLeaf().openFile(file, { eState: { line: ref.line } });
}

/**
 * Toggle a task's done state from a calendar chip. Recurring tasks are opened
 * at the line instead: creating the next occurrence needs the Tasks rrule
 * engine, and a wrong toggle would corrupt the recurrence.
 */
export async function toggleTaskDone(ctx: HorizonContext, ref: TaskRef): Promise<void> {
  const parsed = parseTaskLine(ref.rawText);
  if (!parsed) return;
  if (parsed.recurring) {
    new Notice('Horizon: i task ricorrenti si completano dal file — te lo apro.');
    await openAtLine(ctx, ref);
    return;
  }
  await editTaskLine(ctx, ref, (line) => toggleDone(line, todayKey()).line);
}

/** Rewrite one date field of a task (drag & drop reschedule). */
export async function rescheduleTask(
  ctx: HorizonContext,
  ref: TaskRef,
  kind: TaskDateKind,
  newKey: DayKey,
): Promise<void> {
  const changed = await editTaskLine(ctx, ref, (line) => rewriteDate(line, kind, newKey));
  if (changed) {
    new Notice(`Horizon: task spostato al ${newKey}.`);
  }
}
