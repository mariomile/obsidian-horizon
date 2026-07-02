import { Component } from 'obsidian';

import { addDays, isoWeek, startOfWeekMonday, todayKey, weekDays } from '../dates.ts';
import type { DayKey } from '../types.ts';
import type { HorizonContext } from './context.ts';
import { chipsForDay, renderChip } from './day-cell.ts';
import { registerDropTargets } from './dnd.ts';
import { showTaskChipMenu } from './task-menu.ts';
import type { DragPayload } from './dnd.ts';

export interface WeekViewCallbacks {
  onDayClick: (key: DayKey, event: MouseEvent | KeyboardEvent) => void;
  onChipClick: (chipEl: HTMLElement, event: MouseEvent | KeyboardEvent) => void;
  onTaskToggle: (chipEl: HTMLElement) => void;
  onTaskDrop: (payload: DragPayload, targetKey: DayKey) => void;
  onOverdueClick: () => void;
  onDayHover: (key: DayKey, cellEl: HTMLElement, event: MouseEvent) => void;
  onChipHover: (path: string, chipEl: HTMLElement, event: MouseEvent) => void;
}

/** Week mode: seven full-height columns with every chip visible. */
export class WeekView extends Component {
  private readonly ctx: HorizonContext;
  private readonly containerEl: HTMLElement;
  private readonly callbacks: WeekViewCallbacks;
  private monday: DayKey;

  constructor(ctx: HorizonContext, containerEl: HTMLElement, callbacks: WeekViewCallbacks) {
    super();
    this.ctx = ctx;
    this.containerEl = containerEl;
    this.callbacks = callbacks;
    this.monday = startOfWeekMonday(ctx.uiState.activeDate);
  }

  onload(): void {
    this.register(this.ctx.dayIndex.subscribe(() => this.render()));
    this.containerEl.addClass('horizon-week');
    this.containerEl.addEventListener('click', this.handleClick);
    this.containerEl.addEventListener('keydown', this.handleKeydown);
    this.containerEl.addEventListener('mouseover', this.handleHover);
    this.containerEl.addEventListener('contextmenu', this.handleContextMenu);
    this.register(
      registerDropTargets(this.containerEl, '.horizon-week__col', (payload, key) =>
        this.callbacks.onTaskDrop(payload, key),
      ),
    );
    this.register(() => {
      this.containerEl.removeEventListener('click', this.handleClick);
      this.containerEl.removeEventListener('keydown', this.handleKeydown);
      this.containerEl.removeEventListener('mouseover', this.handleHover);
      this.containerEl.removeEventListener('contextmenu', this.handleContextMenu);
      this.containerEl.empty();
      this.containerEl.removeClass('horizon-week');
    });
    this.render();
  }

  title(): string {
    const sunday = addDays(this.monday, 6);
    const from = this.ctx.moment(this.monday, 'YYYY-MM-DD', true).format('D MMM');
    const to = this.ctx.moment(sunday, 'YYYY-MM-DD', true).format('D MMM YYYY');
    return `${from} – ${to} · W${isoWeek(this.monday).week}`;
  }

  step(direction: 1 | -1): void {
    this.monday = addDays(this.monday, direction * 7);
    this.render();
  }

  goToday(): void {
    this.monday = startOfWeekMonday(todayKey());
    this.ctx.uiState.setActiveDate(todayKey());
    this.render();
  }

  showDate(key: DayKey): void {
    this.monday = startOfWeekMonday(key);
    this.render();
  }

  render(): void {
    const el = this.containerEl;
    el.empty();
    const today = todayKey();
    const overdueCount = this.ctx.dayIndex.openDueBefore(today).length;
    for (const key of weekDays(this.monday)) {
      const col = el.createDiv({
        cls: `horizon-week__col${key === today ? ' horizon-week__col--today' : ''}`,
      });
      col.dataset.key = key;
      const head = col.createDiv({ cls: 'horizon-week__head' });
      head.dataset.key = key;
      head.tabIndex = 0;
      head.setAttribute('role', 'button');
      head.createSpan({
        cls: 'horizon-week__dow',
        text: this.ctx.moment(key, 'YYYY-MM-DD', true).format('ddd'),
      });
      const num = head.createSpan({
        cls: 'horizon-cell__num horizon-week__num',
        text: this.ctx.moment(key, 'YYYY-MM-DD', true).format('D'),
      });
      if (key === today) num.addClass('horizon-week__num--today');
      if (key === today && overdueCount > 0) {
        const badge = head.createSpan({
          cls: 'horizon-cell__overdue-badge',
          text: `\u21a9 ${overdueCount}`,
        });
        badge.setAttribute('aria-label', `${overdueCount} task in ritardo`);
        badge.addEventListener('click', (event) => {
          event.stopPropagation();
          this.callbacks.onOverdueClick();
        });
      }
      if (this.ctx.periodic.noteFor('daily', key)) head.addClass('horizon-week__head--has-note');

      const chips = chipsForDay(this.ctx, key, today);
      const chipsEl = col.createDiv({ cls: 'horizon-week__chips' });
      if (chips.length === 0) {
        chipsEl.createDiv({ cls: 'horizon-week__blank', text: '—' });
      } else {
        for (const chip of chips) renderChip(chipsEl, chip);
      }
    }
  }

  private readonly handleClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const checkEl = target.closest<HTMLElement>('.horizon-chip__check');
    if (checkEl) {
      const chipHost = checkEl.closest<HTMLElement>('.horizon-chip');
      if (chipHost) this.callbacks.onTaskToggle(chipHost);
      return;
    }
    const chipEl = target.closest<HTMLElement>('.horizon-chip');
    if (chipEl?.dataset.path) {
      this.callbacks.onChipClick(chipEl, event);
      return;
    }
    const headEl = target.closest<HTMLElement>('.horizon-week__head');
    if (headEl?.dataset.key) {
      this.ctx.uiState.setActiveDate(headEl.dataset.key);
      this.callbacks.onDayClick(headEl.dataset.key, event);
    }
  };

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const chipEl = target.closest<HTMLElement>('.horizon-chip');
    if (chipEl?.dataset.path && target === chipEl) {
      event.preventDefault();
      this.callbacks.onChipClick(chipEl, event);
      return;
    }
    const headEl = target.closest<HTMLElement>('.horizon-week__head');
    if (headEl?.dataset.key && target === headEl) {
      event.preventDefault();
      this.callbacks.onDayClick(headEl.dataset.key, event);
    }
  };

  private readonly handleContextMenu = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const chipEl = target.closest<HTMLElement>('.horizon-chip');
    if (!chipEl?.dataset.raw) return;
    event.preventDefault();
    showTaskChipMenu(this.ctx, chipEl, event);
  };

  private readonly handleHover = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const chipEl = target.closest<HTMLElement>('.horizon-chip');
    if (chipEl) {
      const related = event.relatedTarget;
      if (related instanceof Node && chipEl.contains(related)) return;
      if (chipEl.dataset.path) this.callbacks.onChipHover(chipEl.dataset.path, chipEl, event);
      return;
    }
    const headEl = target.closest<HTMLElement>('.horizon-week__head');
    if (!headEl?.dataset.key) return;
    const related = event.relatedTarget;
    if (related instanceof Node && headEl.contains(related)) return;
    this.callbacks.onDayHover(headEl.dataset.key, headEl, event);
  };
}
