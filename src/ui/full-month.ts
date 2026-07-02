import { Component } from 'obsidian';

import { addDays, addMonths, dayKey, isoWeek, monthGrid, parseDayKey, todayKey } from '../dates.ts';
import type { DayKey } from '../types.ts';
import { acceptProposal } from '../edits/proposal-actions.ts';
import type { HorizonContext } from './context.ts';
import { renderFullDayCell } from './day-cell.ts';
import { registerDropTargets } from './dnd.ts';
import { showTaskChipMenu } from './task-menu.ts';
import type { DragPayload } from './dnd.ts';

export interface FullMonthCallbacks {
  onDayNumberClick: (key: DayKey, event: MouseEvent | KeyboardEvent) => void;
  onWeekClick: (mondayKey: DayKey, event: MouseEvent) => void;
  onChipClick: (chipEl: HTMLElement, event: MouseEvent | KeyboardEvent) => void;
  onTaskToggle: (chipEl: HTMLElement) => void;
  onOverflow: (key: DayKey, anchorEl: HTMLElement, event: MouseEvent) => void;
  onTaskDrop: (payload: DragPayload, targetKey: DayKey) => void;
  onOverdueClick: () => void;
  onDayHover: (key: DayKey, cellEl: HTMLElement, event: MouseEvent) => void;
  onChipHover: (path: string, chipEl: HTMLElement, event: MouseEvent) => void;
}

/** Month mode of the full calendar tab: 7-column grid with content chips. */
export class FullMonth extends Component {
  private readonly ctx: HorizonContext;
  private readonly containerEl: HTMLElement;
  private readonly callbacks: FullMonthCallbacks;
  private displayed: { y: number; m: number };

  constructor(ctx: HorizonContext, containerEl: HTMLElement, callbacks: FullMonthCallbacks) {
    super();
    this.ctx = ctx;
    this.containerEl = containerEl;
    this.callbacks = callbacks;
    const { y, m } = ctx.uiState.visibleMonth;
    this.displayed = { y, m };
  }

  onload(): void {
    this.register(this.ctx.dayIndex.subscribe(() => this.render()));
    this.register(this.ctx.proposals.subscribe(() => this.render()));
    this.register(
      this.ctx.uiState.subscribe(() => {
        const { y, m } = this.ctx.uiState.visibleMonth;
        if (y !== this.displayed.y || m !== this.displayed.m) {
          this.displayed = { y, m };
          this.render();
        }
      }),
    );
    this.containerEl.addClass('horizon-month');
    this.containerEl.addEventListener('click', this.handleClick);
    this.containerEl.addEventListener('keydown', this.handleKeydown);
    this.containerEl.addEventListener('mouseover', this.handleHover);
    this.containerEl.addEventListener('contextmenu', this.handleContextMenu);
    this.register(
      registerDropTargets(this.containerEl, '.horizon-cell', (payload, key) =>
        this.callbacks.onTaskDrop(payload, key),
      ),
    );
    this.register(() => {
      this.containerEl.removeEventListener('click', this.handleClick);
      this.containerEl.removeEventListener('keydown', this.handleKeydown);
      this.containerEl.removeEventListener('mouseover', this.handleHover);
      this.containerEl.removeEventListener('contextmenu', this.handleContextMenu);
      this.containerEl.empty();
      this.containerEl.removeClass('horizon-month');
    });
    this.render();
  }

  title(): string {
    const first = dayKey(this.displayed.y, this.displayed.m, 1);
    return this.ctx.moment(first, 'YYYY-MM-DD', true).format('MMMM YYYY');
  }

  step(direction: 1 | -1): void {
    const next = parseDayKey(addMonths(dayKey(this.displayed.y, this.displayed.m, 1), direction));
    if (!next) return;
    this.displayed = { y: next.y, m: next.m };
    this.ctx.uiState.setVisibleMonth(this.displayed);
    this.render();
  }

  goToday(): void {
    const today = parseDayKey(todayKey());
    if (!today) return;
    this.displayed = { y: today.y, m: today.m };
    this.ctx.uiState.setVisibleMonth(this.displayed);
    this.ctx.uiState.setActiveDate(todayKey());
    this.render();
  }

  showDate(key: DayKey): void {
    const ymd = parseDayKey(key);
    if (!ymd) return;
    this.displayed = { y: ymd.y, m: ymd.m };
    this.ctx.uiState.setVisibleMonth(this.displayed);
    this.render();
  }

  render(): void {
    const el = this.containerEl;
    el.empty();
    const today = todayKey();
    const overdueCount = this.ctx.dayIndex.openDueBefore(today).length;
    const showWeeks = this.ctx.settings.showWeekNumbers;
    const grid = el.createDiv({
      cls: `horizon-month__grid${showWeeks ? ' horizon-month__grid--weeks' : ''}`,
    });

    const cells = monthGrid(this.displayed.y, this.displayed.m);
    const monday = cells[0] ?? dayKey(this.displayed.y, this.displayed.m, 1);
    if (showWeeks) grid.createSpan({ cls: 'horizon-month__dow' });
    for (let i = 0; i < 7; i++) {
      grid.createSpan({
        cls: 'horizon-month__dow',
        text: this.ctx.moment(addDays(monday, i), 'YYYY-MM-DD', true).format('ddd'),
      });
    }

    for (let week = 0; week < 6; week++) {
      const weekStart = cells[week * 7];
      if (weekStart === undefined) break;
      if (showWeeks) {
        const info = isoWeek(weekStart);
        const weekEl = grid.createSpan({ cls: 'horizon-cal__weeknum horizon-month__weeknum', text: String(info.week) });
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
        renderFullDayCell(
          this.ctx,
          grid,
          key,
          { displayedMonth: this.displayed, today, overdueCount: key === today ? overdueCount : 0 },
          { onOverflow: (k, anchorEl, event) => this.callbacks.onOverflow(k, anchorEl, event) },
        );
      }
    }
  }

  private readonly handleClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('.horizon-cell__overdue-badge')) {
      this.callbacks.onOverdueClick();
      return;
    }
    const weekEl = target.closest<HTMLElement>('.horizon-cal__weeknum');
    if (weekEl?.dataset.week) {
      this.callbacks.onWeekClick(weekEl.dataset.week, event);
      return;
    }
    const ghostBtn = target.closest<HTMLElement>('.horizon-ghost__accept, .horizon-ghost__dismiss');
    if (ghostBtn) {
      const ghostChip = ghostBtn.closest<HTMLElement>('.horizon-chip');
      const proposalId = ghostChip?.dataset.proposal;
      if (proposalId) {
        const proposal = this.ctx.proposals.get(proposalId);
        if (proposal && ghostBtn.classList.contains('horizon-ghost__accept')) {
          void acceptProposal(this.ctx, proposal).then(() => this.ctx.proposals.remove(proposalId));
        } else {
          void this.ctx.proposals.remove(proposalId);
        }
      }
      return;
    }
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
    const numEl = target.closest<HTMLElement>('.horizon-cell__num');
    if (numEl?.dataset.key) {
      this.ctx.uiState.setActiveDate(numEl.dataset.key);
      this.callbacks.onDayNumberClick(numEl.dataset.key, event);
      return;
    }
    const cellEl = target.closest<HTMLElement>('.horizon-cell');
    if (cellEl?.dataset.key) {
      this.ctx.uiState.setActiveDate(cellEl.dataset.key);
      this.callbacks.onDayNumberClick(cellEl.dataset.key, event);
    }
  };

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    if (this.handleArrowNav(event)) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const chipEl = target.closest<HTMLElement>('.horizon-chip');
    if (chipEl?.dataset.path && target === chipEl) {
      event.preventDefault();
      this.callbacks.onChipClick(chipEl, event);
      return;
    }
    const numEl = target.closest<HTMLElement>('.horizon-cell__num');
    if (numEl?.dataset.key && target === numEl) {
      event.preventDefault();
      this.callbacks.onDayNumberClick(numEl.dataset.key, event);
    }
  };

  private handleArrowNav(event: KeyboardEvent): boolean {
    const deltas: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    const delta = deltas[event.key];
    if (delta === undefined) return false;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return false;
    const numEl = target.closest<HTMLElement>('.horizon-cell__num');
    if (!numEl?.dataset.key) return false;
    const nextKey = addDays(numEl.dataset.key, delta);
    const nextEl = this.containerEl.querySelector<HTMLElement>(
      `.horizon-cell__num[data-key="${nextKey}"]`,
    );
    if (!nextEl) return false;
    event.preventDefault();
    nextEl.focus();
    return true;
  }

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
    const cellEl = target.closest<HTMLElement>('.horizon-cell');
    if (!cellEl?.dataset.key) return;
    const related = event.relatedTarget;
    if (related instanceof Node && cellEl.contains(related)) return;
    this.callbacks.onDayHover(cellEl.dataset.key, cellEl, event);
  };
}
