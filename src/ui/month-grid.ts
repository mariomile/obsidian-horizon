import { Component, setIcon } from 'obsidian';

import {
  addDays,
  addMonths,
  dayKey,
  isoWeek,
  monthGrid,
  parseDayKey,
  todayKey,
} from '../dates.ts';
import type { DayKey } from '../types.ts';
import type { HorizonContext } from './context.ts';
import { renderMiniDayCell } from './day-cell.ts';
import { registerDropTargets } from './dnd.ts';
import type { DragPayload } from './dnd.ts';

export interface MonthGridCallbacks {
  onDayClick?: (key: DayKey, event: MouseEvent | KeyboardEvent) => void;
  onTaskDrop?: (payload: DragPayload, targetKey: DayKey) => void;
  onWeekClick?: (mondayKey: DayKey, event: MouseEvent) => void;
  onDayHover?: (key: DayKey, cellEl: HTMLElement, event: MouseEvent) => void;
}

/** Sidebar mini month calendar. Re-renders wholesale — 42 cells is cheap. */
export class MonthGrid extends Component {
  private readonly ctx: HorizonContext;
  private readonly containerEl: HTMLElement;
  private readonly callbacks: MonthGridCallbacks;
  private displayed: { y: number; m: number };

  constructor(ctx: HorizonContext, containerEl: HTMLElement, callbacks: MonthGridCallbacks = {}) {
    super();
    this.ctx = ctx;
    this.containerEl = containerEl;
    this.callbacks = callbacks;
    const today = parseDayKey(todayKey());
    this.displayed = today ? { y: today.y, m: today.m } : { y: 2026, m: 1 };
  }

  onload(): void {
    this.register(this.ctx.dayIndex.subscribe(() => this.render()));
    this.register(this.ctx.uiState.subscribe(() => this.followActiveDate()));
    this.containerEl.addClass('horizon-cal', 'horizon-cal--mini');
    this.containerEl.addEventListener('click', this.handleClick);
    this.containerEl.addEventListener('keydown', this.handleKeydown);
    this.containerEl.addEventListener('mouseover', this.handleHover);
    this.register(
      registerDropTargets(this.containerEl, '.horizon-cell', (payload, key) => {
        this.callbacks.onTaskDrop?.(payload, key);
      }),
    );
    this.register(() => {
      this.containerEl.removeEventListener('click', this.handleClick);
      this.containerEl.removeEventListener('keydown', this.handleKeydown);
      this.containerEl.removeEventListener('mouseover', this.handleHover);
      this.containerEl.empty();
      this.containerEl.removeClass('horizon-cal', 'horizon-cal--mini');
    });
    this.render();
  }

  showMonth(y: number, m: number): void {
    if (this.displayed.y === y && this.displayed.m === m) return;
    this.displayed = { y, m };
    this.render();
  }

  render(): void {
    const el = this.containerEl;
    el.empty();
    const today = todayKey();
    const firstOfMonth = dayKey(this.displayed.y, this.displayed.m, 1);
    const showWeeks = this.ctx.settings.showWeekNumbers;

    const header = el.createDiv({ cls: 'horizon-cal__header' });
    const title = header.createSpan({ cls: 'horizon-cal__title' });
    title.setText(this.ctx.moment(firstOfMonth, 'YYYY-MM-DD', true).format('MMMM YYYY'));
    const nav = header.createDiv({ cls: 'horizon-cal__nav' });
    this.navButton(nav, 'chevron-left', 'Mese precedente', () => this.step(-1));
    this.navButton(nav, 'circle-dot', 'Oggi', () => this.goToday());
    this.navButton(nav, 'chevron-right', 'Mese successivo', () => this.step(1));

    const grid = el.createDiv({
      cls: `horizon-cal__grid${showWeeks ? ' horizon-cal__grid--weeks' : ''}`,
    });

    if (showWeeks) grid.createSpan({ cls: 'horizon-cal__dow horizon-cal__dow--week', text: 'W' });
    const monday = monthGrid(this.displayed.y, this.displayed.m)[0] ?? firstOfMonth;
    for (let i = 0; i < 7; i++) {
      grid.createSpan({
        cls: 'horizon-cal__dow',
        text: this.ctx.moment(addDays(monday, i), 'YYYY-MM-DD', true).format('dd'),
      });
    }

    const cells = monthGrid(this.displayed.y, this.displayed.m);
    for (let week = 0; week < 6; week++) {
      const weekStart = cells[week * 7];
      if (weekStart === undefined) break;
      if (showWeeks) {
        const info = isoWeek(weekStart);
        const weekEl = grid.createSpan({
          cls: 'horizon-cal__weeknum',
          text: String(info.week),
        });
        weekEl.dataset.week = weekStart;
        weekEl.tabIndex = 0;
        weekEl.setAttribute('role', 'button');
        weekEl.setAttribute('aria-label', `Nota settimanale W${info.week}`);
        if (this.ctx.periodic.noteFor('weekly', weekStart)) {
          weekEl.addClass('horizon-cal__weeknum--has-note');
        }
      }
      for (let i = 0; i < 7; i++) {
        const key = cells[week * 7 + i];
        if (key === undefined) continue;
        renderMiniDayCell(this.ctx, grid, key, { displayedMonth: this.displayed, today });
      }
    }
  }

  private navButton(
    parent: HTMLElement,
    icon: string,
    label: string,
    onClick: () => void,
  ): void {
    const button = parent.createEl('button', { cls: 'clickable-icon horizon-cal__nav-btn' });
    button.setAttribute('aria-label', label);
    setIcon(button, icon);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      onClick();
    });
  }

  private step(direction: 1 | -1): void {
    const next = parseDayKey(addMonths(dayKey(this.displayed.y, this.displayed.m, 1), direction));
    if (!next) return;
    this.displayed = { y: next.y, m: next.m };
    this.render();
  }

  private goToday(): void {
    const today = parseDayKey(todayKey());
    if (!today) return;
    this.displayed = { y: today.y, m: today.m };
    this.ctx.uiState.setActiveDate(todayKey());
    this.render();
  }

  private followActiveDate(): void {
    const active = parseDayKey(this.ctx.uiState.activeDate);
    if (!active) return;
    if (active.y !== this.displayed.y || active.m !== this.displayed.m) {
      this.displayed = { y: active.y, m: active.m };
    }
    this.render();
  }

  private readonly handleClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const weekEl = target.closest<HTMLElement>('.horizon-cal__weeknum');
    if (weekEl?.dataset.week) {
      this.callbacks.onWeekClick?.(weekEl.dataset.week, event);
      return;
    }
    const cellEl = target.closest<HTMLElement>('.horizon-cell');
    if (!cellEl?.dataset.key) return;
    this.ctx.uiState.setActiveDate(cellEl.dataset.key);
    this.callbacks.onDayClick?.(cellEl.dataset.key, event);
  };

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const cellEl = target.closest<HTMLElement>('.horizon-cell');
    if (!cellEl?.dataset.key || target !== cellEl) return;
    event.preventDefault();
    this.ctx.uiState.setActiveDate(cellEl.dataset.key);
    this.callbacks.onDayClick?.(cellEl.dataset.key, event);
  };

  private readonly handleHover = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const cellEl = target.closest<HTMLElement>('.horizon-cell');
    if (!cellEl?.dataset.key) return;
    const related = event.relatedTarget;
    if (related instanceof Node && cellEl.contains(related)) return;
    this.callbacks.onDayHover?.(cellEl.dataset.key, cellEl, event);
  };
}
