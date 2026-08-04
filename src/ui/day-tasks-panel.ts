import { Component } from 'obsidian';

import { todayKey } from '../dates.ts';
import { toggleTaskDone } from '../edits/task-edit.ts';
import type { HorizonContext } from './context.ts';
import { chipsForDay, renderChip, taskRefFromChip } from './day-cell.ts';

/**
 * Compact list of the active day's open tasks (due/scheduled/done), mounted
 * below the sidebar's week card. Reuses the same chip data/rendering the
 * mini-calendar's dots and Week view already rely on — no new task source.
 */
export class DayTasksPanel extends Component {
  private readonly ctx: HorizonContext;
  private readonly containerEl: HTMLElement;

  constructor(ctx: HorizonContext, containerEl: HTMLElement) {
    super();
    this.ctx = ctx;
    this.containerEl = containerEl;
  }

  onload(): void {
    this.containerEl.addClass('horizon-day-tasks');
    this.containerEl.addEventListener('click', this.handleClick);
    this.register(this.ctx.uiState.subscribe(() => this.render()));
    this.register(this.ctx.dayIndex.subscribe(() => this.render()));
    this.register(() => {
      this.containerEl.removeEventListener('click', this.handleClick);
      this.containerEl.empty();
      this.containerEl.removeClass('horizon-day-tasks');
    });
    this.render();
  }

  render(): void {
    const el = this.containerEl;
    el.empty();

    if (!this.ctx.settings.notePreviewPanels) {
      el.hide();
      return;
    }
    el.show();

    const key = this.ctx.uiState.activeDate;
    const today = todayKey();
    const label = key === today ? 'Today' : this.ctx.moment(key, 'YYYY-MM-DD', true).format('dddd D MMM');
    el.createDiv({ cls: 'horizon-period-panel__heading', text: label });

    const chips = chipsForDay(this.ctx, key, today).filter(
      (chip) => chip.kind === 'due' || chip.kind === 'scheduled' || chip.kind === 'done',
    );
    if (chips.length === 0) {
      el.createDiv({ cls: 'horizon-period-panel__empty-label', text: 'No tasks' });
      return;
    }
    const list = el.createDiv({ cls: 'horizon-day-tasks__list' });
    for (const chip of chips) renderChip(list, chip);
  }

  private readonly handleClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const checkEl = target.closest<HTMLElement>('.horizon-chip__check');
    if (checkEl) {
      const chipHost = checkEl.closest<HTMLElement>('.horizon-chip');
      const ref = chipHost && taskRefFromChip(chipHost);
      if (ref) void toggleTaskDone(this.ctx, ref);
      return;
    }

    const chipEl = target.closest<HTMLElement>('.horizon-chip');
    const path = chipEl?.dataset.path;
    if (!path) return;
    const file = this.ctx.app.vault.getFileByPath(path);
    if (!file) return;
    const line = chipEl.dataset.line !== undefined ? Number(chipEl.dataset.line) : -1;
    void this.ctx.app.workspace.getLeaf(false).openFile(file, line >= 0 ? { eState: { line } } : undefined);
  };
}
