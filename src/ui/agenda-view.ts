import { Component } from 'obsidian';

import { addDays, todayKey } from '../dates.ts';
import type { DayKey } from '../types.ts';
import type { HorizonContext } from './context.ts';
import { rescheduleAll } from '../edits/task-edit.ts';
import { chipsForDay, renderChip } from './day-cell.ts';
import type { ChipSpec } from './day-cell.ts';
import { showTaskChipMenu } from './task-menu.ts';
import { registerDropTargets } from './dnd.ts';
import type { DragPayload } from './dnd.ts';

export interface AgendaViewCallbacks {
  onDayClick: (key: DayKey, event: MouseEvent | KeyboardEvent) => void;
  onChipClick: (chipEl: HTMLElement, event: MouseEvent | KeyboardEvent) => void;
  onTaskToggle: (chipEl: HTMLElement) => void;
  onTaskDrop: (payload: DragPayload, targetKey: DayKey) => void;
  onDayHover: (key: DayKey, cellEl: HTMLElement, event: MouseEvent) => void;
}

/** Agenda mode: chronological list of the upcoming days that have content. */
export class AgendaView extends Component {
  private readonly ctx: HorizonContext;
  private readonly containerEl: HTMLElement;
  private readonly callbacks: AgendaViewCallbacks;
  private start: DayKey;

  constructor(ctx: HorizonContext, containerEl: HTMLElement, callbacks: AgendaViewCallbacks) {
    super();
    this.ctx = ctx;
    this.containerEl = containerEl;
    this.callbacks = callbacks;
    this.start = todayKey();
  }

  onload(): void {
    this.register(this.ctx.dayIndex.subscribe(() => this.render()));
    this.containerEl.addClass('horizon-agenda');
    this.containerEl.addEventListener('click', this.handleClick);
    this.containerEl.addEventListener('keydown', this.handleKeydown);
    this.containerEl.addEventListener('mouseover', this.handleHover);
    this.containerEl.addEventListener('contextmenu', this.handleContextMenu);
    this.register(
      registerDropTargets(this.containerEl, '.horizon-agenda__day', (payload, key) =>
        this.callbacks.onTaskDrop(payload, key),
      ),
    );
    this.register(() => {
      this.containerEl.removeEventListener('click', this.handleClick);
      this.containerEl.removeEventListener('keydown', this.handleKeydown);
      this.containerEl.removeEventListener('mouseover', this.handleHover);
      this.containerEl.removeEventListener('contextmenu', this.handleContextMenu);
      this.containerEl.empty();
      this.containerEl.removeClass('horizon-agenda');
    });
    this.render();
  }

  private get horizonDays(): number {
    return this.ctx.settings.agendaHorizonDays;
  }

  title(): string {
    if (this.start === todayKey()) return `Prossimi ${this.horizonDays} giorni`;
    const from = this.ctx.moment(this.start, 'YYYY-MM-DD', true).format('D MMM');
    const to = this.ctx
      .moment(addDays(this.start, this.horizonDays - 1), 'YYYY-MM-DD', true)
      .format('D MMM YYYY');
    return `${from} – ${to}`;
  }

  step(direction: 1 | -1): void {
    this.start = addDays(this.start, direction * this.horizonDays);
    this.render();
  }

  goToday(): void {
    this.start = todayKey();
    this.ctx.uiState.setActiveDate(todayKey());
    this.render();
  }

  showDate(key: DayKey): void {
    this.start = key;
    this.render();
  }

  render(): void {
    const el = this.containerEl;
    el.empty();
    const today = todayKey();
    if (this.start === today) this.renderOverdueSection(el, today);
    let shown = 0;
    for (let i = 0; i < this.horizonDays; i++) {
      const key = addDays(this.start, i);
      const chips = chipsForDay(this.ctx, key, today);
      const isToday = key === today;
      if (chips.length === 0 && !isToday) continue;
      shown += 1;

      const dayEl = el.createDiv({
        cls: `horizon-agenda__day${isToday ? ' horizon-agenda__day--today' : ''}`,
      });
      dayEl.dataset.key = key;
      const head = dayEl.createDiv({ cls: 'horizon-agenda__head' });
      head.dataset.key = key;
      head.tabIndex = 0;
      head.setAttribute('role', 'button');
      head.createSpan({
        cls: 'horizon-agenda__date',
        text: this.ctx.moment(key, 'YYYY-MM-DD', true).format('dddd D MMMM'),
      });
      if (isToday) head.createSpan({ cls: 'horizon-agenda__badge', text: 'Oggi' });
      if (this.ctx.periodic.noteFor('daily', key)) {
        head.createSpan({ cls: 'horizon-agenda__note-dot' });
      }

      const chipsEl = dayEl.createDiv({ cls: 'horizon-agenda__chips' });
      if (chips.length === 0) {
        chipsEl.createDiv({ cls: 'horizon-week__blank', text: 'Nessun elemento.' });
      } else {
        for (const chip of chips) renderChip(chipsEl, chip);
      }
    }
    if (shown === 0) {
      el.createDiv({
        cls: 'horizon-view__empty',
        text: `Nessun elemento nei prossimi ${this.horizonDays} giorni.`,
      });
    }
  }

  private renderOverdueSection(el: HTMLElement, today: DayKey): void {
    const overdue = this.ctx.dayIndex.openDueBefore(today);
    if (overdue.length === 0) return;
    const section = el.createDiv({ cls: 'horizon-agenda__day horizon-agenda__overdue' });
    const head = section.createDiv({ cls: 'horizon-agenda__head horizon-agenda__head--overdue' });
    head.createSpan({ cls: 'horizon-agenda__date', text: `In ritardo (${overdue.length})` });
    const batch = head.createEl('button', {
      cls: 'horizon-agenda__batch-btn',
      text: 'Porta tutto a oggi',
    });
    batch.addEventListener('click', (event) => {
      event.stopPropagation();
      void rescheduleAll(
        this.ctx,
        overdue.map((t) => ({
          ref: { path: t.path, line: t.line, rawText: t.rawText },
          kind: 'due' as const,
        })),
        today,
      );
    });
    const chipsEl = section.createDiv({ cls: 'horizon-agenda__chips' });
    for (const task of overdue) {
      const dueLabel = task.due
        ? this.ctx.moment(task.due, 'YYYY-MM-DD', true).format('D MMM')
        : '';
      const chip: ChipSpec = {
        cls: 'horizon-chip--due horizon-chip--overdue',
        label: dueLabel ? `${task.description} — ${dueLabel}` : task.description,
        path: task.path,
        line: task.line,
        rawText: task.rawText,
        kind: 'due',
        dayKey: task.due ?? today,
        done: false,
        recurring: task.recurring,
      };
      renderChip(chipsEl, chip);
    }
  }

  private readonly handleContextMenu = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const chipEl = target.closest<HTMLElement>('.horizon-chip');
    if (!chipEl?.dataset.raw) return;
    event.preventDefault();
    showTaskChipMenu(this.ctx, chipEl, event);
  };

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
    const headEl = target.closest<HTMLElement>('.horizon-agenda__head');
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
    const headEl = target.closest<HTMLElement>('.horizon-agenda__head');
    if (headEl?.dataset.key && target === headEl) {
      event.preventDefault();
      this.callbacks.onDayClick(headEl.dataset.key, event);
    }
  };

  private readonly handleHover = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const headEl = target.closest<HTMLElement>('.horizon-agenda__head');
    if (!headEl?.dataset.key) return;
    const related = event.relatedTarget;
    if (related instanceof Node && headEl.contains(related)) return;
    this.callbacks.onDayHover(headEl.dataset.key, headEl, event);
  };
}
