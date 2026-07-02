import {
  ItemView,
  Keymap,
  setIcon,
  type HoverPopover,
  type WorkspaceLeaf,
} from 'obsidian';

import { openPeriodicNote } from '../edits/note-creator.ts';
import { toggleTaskDone } from '../edits/task-edit.ts';
import type { TaskRef } from '../edits/task-edit.ts';
import type { CalendarMode, DayKey } from '../types.ts';
import { AgendaView } from './agenda-view.ts';
import type { HorizonContext } from './context.ts';
import { FullMonth } from './full-month.ts';
import { WeekView } from './week-view.ts';

export const CALENDAR_VIEW_TYPE = 'horizon-calendar';

const MODE_LABELS: Record<CalendarMode, string> = {
  month: 'Mese',
  week: 'Settimana',
  agenda: 'Agenda',
};

/** A mode component mounted inside the calendar tab. */
interface ModeComponent {
  title(): string;
  step(direction: 1 | -1): void;
  goToday(): void;
  showDate(key: DayKey): void;
}

type MountedMode = ModeComponent & (FullMonth | WeekView | AgendaView);

/** Rebuild the guarded task reference carried by a chip's data attributes. */
function taskRefFromChip(chipEl: HTMLElement): TaskRef | null {
  const { path, line, raw } = chipEl.dataset;
  if (path === undefined || line === undefined || raw === undefined) return null;
  const lineNumber = Number(line);
  if (!Number.isInteger(lineNumber) || lineNumber < 0) return null;
  return { path, line: lineNumber, rawText: raw };
}

export class HorizonCalendarView extends ItemView {
  hoverPopover: HoverPopover | null = null;
  private readonly ctx: HorizonContext;
  private periodLabelEl: HTMLElement | null = null;
  private modeHostEl: HTMLElement | null = null;
  private modeButtons = new Map<CalendarMode, HTMLElement>();
  private active: MountedMode | null = null;

  constructor(leaf: WorkspaceLeaf, ctx: HorizonContext) {
    super(leaf);
    this.ctx = ctx;
  }

  getViewType(): string {
    return CALENDAR_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Horizon';
  }

  getIcon(): string {
    return 'calendar-days';
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass('horizon-view');

    const header = this.contentEl.createDiv({ cls: 'horizon-view__header' });
    this.periodLabelEl = header.createSpan({ cls: 'horizon-view__title' });

    const modeSwitch = header.createDiv({ cls: 'horizon-view__modes' });
    for (const mode of ['month', 'week', 'agenda'] as CalendarMode[]) {
      const button = modeSwitch.createEl('button', {
        cls: 'horizon-view__mode-btn',
        text: MODE_LABELS[mode],
      });
      button.addEventListener('click', () => this.setMode(mode));
      this.modeButtons.set(mode, button);
    }

    const nav = header.createDiv({ cls: 'horizon-view__nav' });
    this.navButton(nav, 'chevron-left', 'Precedente', () => {
      this.active?.step(-1);
      this.refreshTitle();
    });
    const todayBtn = nav.createEl('button', { cls: 'horizon-view__today-btn', text: 'Oggi' });
    todayBtn.addEventListener('click', () => {
      this.active?.goToday();
      this.refreshTitle();
    });
    this.navButton(nav, 'chevron-right', 'Successivo', () => {
      this.active?.step(1);
      this.refreshTitle();
    });

    this.modeHostEl = this.contentEl.createDiv({ cls: 'horizon-view__body' });
    this.mountMode(this.ctx.settings.lastMode);
  }

  async onClose(): Promise<void> {
    this.unmountMode();
    this.contentEl.removeClass('horizon-view');
  }

  /** Switch mode, persist it, and re-mount the body. */
  setMode(mode: CalendarMode, focusDate?: DayKey): void {
    if (focusDate) this.ctx.uiState.setActiveDate(focusDate);
    this.ctx.settings.lastMode = mode;
    void this.ctx.saveSettings();
    this.ctx.uiState.setMode(mode);
    this.mountMode(mode);
  }

  private mountMode(mode: CalendarMode): void {
    if (!this.modeHostEl) return;
    this.unmountMode();
    this.modeHostEl.empty();
    for (const [key, button] of this.modeButtons) {
      button.toggleClass('horizon-view__mode-btn--active', key === mode);
    }

    const openDaily = (key: DayKey, event: MouseEvent | KeyboardEvent): void => {
      void openPeriodicNote(this.ctx, 'daily', key, Keymap.isModEvent(event));
    };
    const shared = {
      onDayClick: openDaily,
      onChipClick: (chipEl: HTMLElement, event: MouseEvent | KeyboardEvent) =>
        this.openChip(chipEl, event),
      onTaskToggle: (chipEl: HTMLElement) => {
        const ref = taskRefFromChip(chipEl);
        if (ref) void toggleTaskDone(this.ctx, ref);
      },
      onDayHover: (key: DayKey, cellEl: HTMLElement, event: MouseEvent) =>
        this.previewDay(key, cellEl, event),
    };

    let component: MountedMode;
    if (mode === 'month') {
      component = new FullMonth(this.ctx, this.modeHostEl.createDiv(), {
        onDayNumberClick: openDaily,
        onWeekClick: (mondayKey, event) => {
          void openPeriodicNote(this.ctx, 'weekly', mondayKey, Keymap.isModEvent(event));
        },
        onChipClick: shared.onChipClick,
        onTaskToggle: shared.onTaskToggle,
        onOverflow: (key) => this.setMode('week', key),
        onDayHover: shared.onDayHover,
      });
    } else if (mode === 'week') {
      component = new WeekView(this.ctx, this.modeHostEl.createDiv(), shared);
    } else {
      component = new AgendaView(this.ctx, this.modeHostEl.createDiv(), shared);
    }
    this.addChild(component);
    this.active = component;
    this.refreshTitle();
  }

  private unmountMode(): void {
    if (this.active) this.removeChild(this.active);
    this.active = null;
  }

  private refreshTitle(): void {
    this.periodLabelEl?.setText(this.active?.title() ?? 'Horizon');
  }

  private navButton(parent: HTMLElement, icon: string, label: string, onClick: () => void): void {
    const button = parent.createEl('button', { cls: 'clickable-icon horizon-view__nav-btn' });
    button.setAttribute('aria-label', label);
    setIcon(button, icon);
    button.addEventListener('click', onClick);
  }

  private openChip(chipEl: HTMLElement, event: MouseEvent | KeyboardEvent): void {
    const path = chipEl.dataset.path;
    if (!path) return;
    const file = this.app.vault.getFileByPath(path);
    if (!file) return;
    const paneType = Keymap.isModEvent(event);
    const leaf = this.app.workspace.getLeaf(paneType === true ? 'tab' : paneType || undefined);
    const line = chipEl.dataset.line !== undefined ? Number(chipEl.dataset.line) : -1;
    void leaf.openFile(file, line >= 0 ? { eState: { line } } : undefined);
  }

  private previewDay(key: DayKey, cellEl: HTMLElement, event: MouseEvent): void {
    if (!this.ctx.periodic.noteFor('daily', key)) return;
    this.app.workspace.trigger('hover-link', {
      event,
      source: 'horizon',
      hoverParent: this,
      targetEl: cellEl,
      linktext: this.ctx.periodic.pathFor('daily', key),
      sourcePath: '',
    });
  }
}
