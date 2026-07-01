import {
  ItemView,
  Keymap,
  setIcon,
  type HoverPopover,
  type WorkspaceLeaf,
} from 'obsidian';

import { openPeriodicNote } from '../edits/note-creator.ts';
import type { CalendarMode, DayKey } from '../types.ts';
import type { HorizonContext } from './context.ts';
import { FullMonth } from './full-month.ts';

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
  showDate?(key: DayKey): void;
}

export class HorizonCalendarView extends ItemView {
  hoverPopover: HoverPopover | null = null;
  private readonly ctx: HorizonContext;
  private periodLabelEl: HTMLElement | null = null;
  private modeHostEl: HTMLElement | null = null;
  private modeButtons = new Map<CalendarMode, HTMLElement>();
  private active: (ModeComponent & { component: FullMonth }) | null = null;

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

    if (mode === 'month') {
      const component = new FullMonth(this.ctx, this.modeHostEl.createDiv(), {
        onDayNumberClick: (key, event) => {
          void openPeriodicNote(this.ctx, 'daily', key, Keymap.isModEvent(event));
        },
        onWeekClick: (mondayKey, event) => {
          void openPeriodicNote(this.ctx, 'weekly', mondayKey, Keymap.isModEvent(event));
        },
        onChipClick: (chipEl, event) => this.openChip(chipEl, event),
        onOverflow: (key) => this.setMode('week', key),
        onDayHover: (key, cellEl, event) => this.previewDay(key, cellEl, event),
      });
      this.addChild(component);
      this.active = Object.assign(component, { component });
    } else {
      // Week and Agenda modes arrive with the next implementation step.
      this.modeHostEl.createDiv({
        cls: 'horizon-view__empty',
        text: `${MODE_LABELS[mode]} — in arrivo.`,
      });
      this.active = null;
    }
    this.refreshTitle();
  }

  private unmountMode(): void {
    if (this.active) this.removeChild(this.active.component);
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
