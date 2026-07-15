import { ItemView, Keymap, type HoverPopover, type WorkspaceLeaf } from 'obsidian';

import { openPeriodicNote } from '../edits/note-creator.ts';
import { rescheduleTask } from '../edits/task-edit.ts';
import type { HorizonContext } from './context.ts';
import { MonthGrid } from './month-grid.ts';

export const SIDEBAR_VIEW_TYPE = 'horizon-sidebar';

export class HorizonSidebarView extends ItemView {
  hoverPopover: HoverPopover | null = null;
  private readonly ctx: HorizonContext;
  private grid: MonthGrid | null = null;

  constructor(leaf: WorkspaceLeaf, ctx: HorizonContext) {
    super(leaf);
    this.ctx = ctx;
  }

  getViewType(): string {
    return SIDEBAR_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Horizon';
  }

  getIcon(): string {
    return 'calendar';
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass('horizon-sidebar');
    this.grid = this.addChild(
      new MonthGrid(this.ctx, this.contentEl.createDiv(), {
        onDayClick: (key, event) => {
          void openPeriodicNote(this.ctx, 'daily', key, Keymap.isModEvent(event));
        },
        onWeekClick: (mondayKey, event) => {
          void openPeriodicNote(this.ctx, 'weekly', mondayKey, Keymap.isModEvent(event));
        },
        onTaskDrop: (payload, targetKey) => {
          void rescheduleTask(
            this.ctx,
            { path: payload.path, line: payload.line, rawText: payload.rawText },
            payload.dateKind,
            targetKey,
          );
        },
        onDayHover: (key, cellEl, event) => {
          if (!this.ctx.periodic.noteFor('daily', key)) return;
          this.app.workspace.trigger('hover-link', {
            event,
            source: 'horizon',
            hoverParent: this,
            targetEl: cellEl,
            linktext: this.ctx.periodic.pathFor('daily', key),
            sourcePath: '',
          });
        },
      }),
    );
  }

  /** Re-render on external changes (e.g. plugin settings toggled). */
  refresh(): void {
    this.grid?.render();
  }

  async onClose(): Promise<void> {
    if (this.grid) this.removeChild(this.grid);
    this.grid = null;
    this.contentEl.removeClass('horizon-sidebar');
  }
}
