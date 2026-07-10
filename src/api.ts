import { addDays, todayKey } from './dates.ts';
import { normalizePath } from 'obsidian';
import { rescheduleTask, toggleTaskDone } from './edits/task-edit.ts';
import type { TaskRef } from './edits/task-edit.ts';
import type { AgendaExport, TaskExport } from './index/agenda-export.ts';
import { appendProposal, type Proposal } from './index/proposals.ts';
import type { DayKey, TaskDateKind } from './types.ts';
import type { HorizonContext } from './ui/context.ts';

/**
 * Public surface for agents and sibling plugins:
 * `(app.plugins.getPlugin('horizon') as HorizonPlugin).api`
 * Reads come from the live index; writes go through the guarded line-edit
 * path — the same guarantees drag & drop has.
 */
export class HorizonApi {
  private readonly ctx: HorizonContext;
  private readonly writeExport: () => Promise<string>;

  constructor(ctx: HorizonContext, writeExport: () => Promise<string>) {
    this.ctx = ctx;
    this.writeExport = writeExport;
  }

  /** Per-day buckets in [from, to], plus the overdue set as of today. */
  getAgenda(from: DayKey, to: DayKey): AgendaExport {
    return this.ctx.dayIndex.buildExport({
      today: todayKey(),
      from,
      to,
      generatedAt: new Date().toISOString(),
    });
  }

  getOverdue(): TaskExport[] {
    return this.getAgenda(todayKey(), todayKey()).overdue;
  }

  /** Guarded reschedule; false when the task changed underneath (no write). */
  rescheduleTask(ref: TaskRef, kind: TaskDateKind, day: DayKey): Promise<boolean> {
    return rescheduleTask(this.ctx, ref, kind, day, { silent: true });
  }

  toggleTaskDone(ref: TaskRef): Promise<void> {
    return toggleTaskDone(this.ctx, ref);
  }

  /** Write the agenda JSON export now; returns the vault path. */
  exportAgenda(): Promise<string> {
    return this.writeExport();
  }

  /** Append a ghost-chip proposal for the human to accept or dismiss. */
  async propose(proposal: Proposal): Promise<void> {
    const path = normalizePath(this.ctx.settings.proposalsPath);
    const vault = this.ctx.app.vault;
    const existing = vault.getFileByPath(path);
    if (existing) {
      await vault.process(existing, (raw) => appendProposal(raw, proposal));
      return;
    }
    await this.ensureParentFolder(path);
    try {
      await vault.create(path, appendProposal('', proposal));
      return;
    } catch {
      // A concurrent first writer may have created it after our existence check.
    }
    const raced = vault.getFileByPath(path);
    if (!raced) throw new Error(`Horizon: impossibile creare ${path}`);
    await vault.process(raced, (raw) => appendProposal(raw, proposal));
  }

  private async ensureParentFolder(path: string): Promise<void> {
    const slash = path.lastIndexOf('/');
    if (slash <= 0) return;
    const parts = path.slice(0, slash).split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
      current = current === '' ? part : `${current}/${part}`;
      if (!this.ctx.app.vault.getAbstractFileByPath(current)) {
        await this.ctx.app.vault.createFolder(current);
      }
    }
  }

  /** Default export window: a week back through the agenda horizon. */
  defaultWindow(): { from: DayKey; to: DayKey } {
    const today = todayKey();
    return { from: addDays(today, -7), to: addDays(today, this.ctx.settings.agendaHorizonDays) };
  }
}
