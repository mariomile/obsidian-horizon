import { Component } from 'obsidian';

import { addDays, isoWeek, mustParse, parseDayKey, startOfWeekMonday, todayKey, weekDays } from '../dates.ts';
import type { CalEvent } from '../gcal/events.ts';
import type { DayKey, NoteEntry } from '../types.ts';
import { acceptProposal } from '../edits/proposal-actions.ts';
import type { HorizonContext } from './context.ts';
import { attachActivation, chipsForDay, eventChip, linkedEventIds, renderChip } from './day-cell.ts';
import { registerDropTargets } from './dnd.ts';
import { showTaskChipMenu } from './task-menu.ts';
import type { DragPayload } from './dnd.ts';
import { makeButtonLike } from './interactive.ts';
import { layoutDay, minutesInDay } from './time-grid-layout.ts';
import type { GridItem } from './time-grid-layout.ts';

export interface WeekViewCallbacks {
  onDayClick: (key: DayKey, event: MouseEvent | KeyboardEvent) => void;
  onChipClick: (chipEl: HTMLElement, event: MouseEvent | KeyboardEvent) => void;
  onTaskToggle: (chipEl: HTMLElement) => void;
  onTaskDrop: (payload: DragPayload, targetKey: DayKey) => void;
  onOverdueClick: () => void;
  onDayHover: (key: DayKey, cellEl: HTMLElement, event: MouseEvent) => void;
  onChipHover: (path: string, chipEl: HTMLElement, event: MouseEvent) => void;
}

/** Pixels per hour on the grid; the CSS row lines use the same value. */
const HOUR_PX = 48;
/** Timed notes have no end: draw them as half-hour blocks. */
const NOTE_MINUTES = 30;
const NOW_TICK_MS = 60_000;

type Block = { kind: 'event'; event: CalEvent } | { kind: 'note'; note: NoteEntry };

function midnight(key: DayKey): number {
  const { y, m, d } = mustParse(key);
  return new Date(y, m - 1, d).getTime();
}

function hhmmToMinutes(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

/**
 * Week and day modes: a header per day, an all-day lane (all-day events,
 * tasks, untimed notes, proposals) and an hour grid with timed events and
 * timed notes placed by time.
 */
export class WeekView extends Component {
  private readonly ctx: HorizonContext;
  private readonly containerEl: HTMLElement;
  private readonly callbacks: WeekViewCallbacks;
  private readonly span: 1 | 7;
  /** Monday in week mode, the shown day in day mode. */
  private anchor: DayKey;
  private scrollTop: number | null = null;

  constructor(
    ctx: HorizonContext,
    containerEl: HTMLElement,
    callbacks: WeekViewCallbacks,
    span: 1 | 7 = 7,
  ) {
    super();
    this.ctx = ctx;
    this.containerEl = containerEl;
    this.callbacks = callbacks;
    this.span = span;
    this.anchor = this.anchorFor(ctx.uiState.activeDate);
  }

  onload(): void {
    this.register(this.ctx.dayIndex.subscribe(() => this.render()));
    this.register(this.ctx.proposals.subscribe(() => this.render()));
    this.register(this.ctx.gcal.subscribe(() => this.render()));
    this.registerInterval(window.setInterval(() => this.placeNowLine(), NOW_TICK_MS));
    this.containerEl.addClass('horizon-week');
    this.containerEl.toggleClass('horizon-week--day', this.span === 1);
    this.containerEl.addEventListener('click', this.handleClick);
    this.containerEl.addEventListener('keydown', this.handleKeydown);
    this.containerEl.addEventListener('mouseover', this.handleHover);
    this.containerEl.addEventListener('contextmenu', this.handleContextMenu);
    this.register(
      registerDropTargets(this.containerEl, '.horizon-week__lane', (payload, key) =>
        this.callbacks.onTaskDrop(payload, key),
      ),
    );
    this.register(() => {
      this.containerEl.removeEventListener('click', this.handleClick);
      this.containerEl.removeEventListener('keydown', this.handleKeydown);
      this.containerEl.removeEventListener('mouseover', this.handleHover);
      this.containerEl.removeEventListener('contextmenu', this.handleContextMenu);
      this.containerEl.empty();
      this.containerEl.removeClass('horizon-week', 'horizon-week--day');
    });
    this.render();
  }

  title(): string {
    if (this.span === 1) {
      return this.ctx.moment(this.anchor, 'YYYY-MM-DD', true).format('dddd D MMMM YYYY');
    }
    const sunday = addDays(this.anchor, 6);
    const from = this.ctx.moment(this.anchor, 'YYYY-MM-DD', true).format('D MMM');
    const to = this.ctx.moment(sunday, 'YYYY-MM-DD', true).format('D MMM YYYY');
    return `${from} – ${to} · W${isoWeek(this.anchor).week}`;
  }

  step(direction: 1 | -1): void {
    this.anchor = addDays(this.anchor, direction * this.span);
    if (this.span === 1) this.ctx.uiState.setActiveDate(this.anchor);
    this.syncVisibleMonth();
    this.render();
  }

  goToday(): void {
    this.anchor = this.anchorFor(todayKey());
    this.syncVisibleMonth();
    this.ctx.uiState.setActiveDate(todayKey());
    this.render();
  }

  showDate(key: DayKey): void {
    this.anchor = this.anchorFor(key);
    this.syncVisibleMonth();
    this.render();
  }

  private anchorFor(key: DayKey): DayKey {
    return this.span === 7 ? startOfWeekMonday(key) : key;
  }

  private days(): DayKey[] {
    return this.span === 7 ? weekDays(this.anchor) : [this.anchor];
  }

  private syncVisibleMonth(): void {
    const ymd = parseDayKey(this.anchor);
    if (ymd) this.ctx.uiState.setVisibleMonth({ y: ymd.y, m: ymd.m });
  }

  render(): void {
    const el = this.containerEl;
    const previousScroller = el.querySelector<HTMLElement>('.horizon-week__scroller');
    // Only a laid-out scroller has a real position worth keeping.
    if (previousScroller && previousScroller.clientHeight > 0) this.scrollTop = previousScroller.scrollTop;
    el.empty();
    el.setCssProps({ '--horizon-week-days': String(this.span), '--horizon-hour-px': `${HOUR_PX}px` });

    const today = todayKey();
    const days = this.days();
    const overdueCount = this.ctx.dayIndex.openDueBefore(today).length;

    const header = el.createDiv({ cls: 'horizon-week__row horizon-week__header' });
    header.createDiv({ cls: 'horizon-week__gutter' });
    for (const key of days) this.renderHead(header, key, today, overdueCount);

    const lanes = el.createDiv({ cls: 'horizon-week__row horizon-week__lanes' });
    lanes.createDiv({ cls: 'horizon-week__gutter horizon-week__gutter-label', text: 'All day' });
    const blocksByDay = new Map<DayKey, Block[]>();
    for (const key of days) blocksByDay.set(key, this.renderLane(lanes, key, today));

    const scroller = el.createDiv({ cls: 'horizon-week__scroller' });
    const grid = scroller.createDiv({ cls: 'horizon-week__row horizon-week__grid' });
    const gutter = grid.createDiv({ cls: 'horizon-week__gutter horizon-week__hours' });
    for (let hour = 1; hour < 24; hour++) {
      const label = gutter.createDiv({ cls: 'horizon-week__hour', text: `${String(hour).padStart(2, '0')}:00` });
      label.setCssProps({ top: `${hour * HOUR_PX}px` });
    }
    for (const key of days) this.renderDayColumn(grid, key, today, blocksByDay.get(key) ?? []);
    this.placeNowLine();

    // Keep the scroll position across re-renders; first open lands on the work day.
    // Half an hour of headroom so the start hour's label is not clipped. The
    // first render can run before the leaf has a size, so retry next frame.
    const target =
      this.scrollTop ?? Math.max(0, this.ctx.settings.google.dayStartHour * HOUR_PX - HOUR_PX / 2);
    scroller.scrollTop = target;
    if (scroller.clientHeight === 0) {
      window.requestAnimationFrame(() => {
        scroller.scrollTop = target;
      });
    }
  }

  private renderHead(parent: HTMLElement, key: DayKey, today: DayKey, overdueCount: number): void {
    const head = parent.createDiv({
      cls: `horizon-week__head${key === today ? ' horizon-week__head--today' : ''}`,
    });
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
        text: `↩ ${overdueCount}`,
      });
      makeButtonLike(badge, `${overdueCount} overdue tasks`);
      badge.addEventListener('click', (event) => {
        event.stopPropagation();
        this.callbacks.onOverdueClick();
      });
    }
    if (this.ctx.periodic.noteFor('daily', key)) head.addClass('horizon-week__head--has-note');
  }

  /** Everything without a time slot goes in the lane; returns what goes on the grid. */
  private renderLane(parent: HTMLElement, key: DayKey, today: DayKey): Block[] {
    const lane = parent.createDiv({
      cls: `horizon-week__lane${key === today ? ' horizon-week__lane--today' : ''}`,
    });
    lane.dataset.key = key;

    const blocks: Block[] = [];
    const timedNotePaths = new Set<string>();
    const shownEvents = new Set<string>();
    for (const event of this.ctx.gcal.eventsOn(key)) {
      shownEvents.add(event.id);
      if (!event.allDay) blocks.push({ kind: 'event', event });
    }
    if (this.ctx.settings.showNotes) {
      for (const note of this.ctx.dayIndex.getBucket(key)?.notes ?? []) {
        if (note.time === undefined) continue;
        timedNotePaths.add(note.path);
        if (note.eventId !== undefined && shownEvents.has(note.eventId)) continue;
        blocks.push({ kind: 'note', note });
      }
    }

    for (const chip of chipsForDay(this.ctx, key, today)) {
      if (chip.kind === 'event' && chip.event && !chip.event.allDay) continue;
      if (chip.kind === 'note' && timedNotePaths.has(chip.path)) continue;
      renderChip(lane, chip);
    }
    return blocks;
  }

  private renderDayColumn(parent: HTMLElement, key: DayKey, today: DayKey, blocks: Block[]): void {
    const col = parent.createDiv({
      cls: `horizon-week__daycol${key === today ? ' horizon-week__daycol--today' : ''}`,
    });
    col.dataset.key = key;
    const dayStart = midnight(key);
    const linked = linkedEventIds(this.ctx, key);

    const items: GridItem<Block>[] = blocks.map((block) => {
      if (block.kind === 'event') {
        return {
          item: block,
          startMin: minutesInDay(block.event.start, dayStart),
          endMin: minutesInDay(block.event.end, dayStart),
        };
      }
      const startMin = hhmmToMinutes(block.note.time ?? '00:00');
      return { item: block, startMin, endMin: startMin + NOTE_MINUTES };
    });

    for (const placed of layoutDay(items)) {
      const block = placed.item;
      const el = col.createDiv({ cls: 'horizon-block' });
      el.setCssProps({
        top: `${(placed.startMin / 60) * HOUR_PX}px`,
        height: `${((placed.endMin - placed.startMin) / 60) * HOUR_PX}px`,
        left: `${(placed.column / placed.columns) * 100}%`,
        width: `${100 / placed.columns}%`,
      });
      el.tabIndex = 0;
      el.setAttribute('role', 'button');
      if (placed.endMin - placed.startMin < 45) el.addClass('horizon-block--short');

      if (block.kind === 'event') {
        const { event } = block;
        el.addClass('horizon-block--event');
        if (event.color !== '') el.setCssProps({ '--horizon-event-color': event.color });
        el.createDiv({ cls: 'horizon-block__title', text: event.title });
        el.createDiv({
          cls: 'horizon-block__time',
          text: `${event.startTime ?? ''} – ${event.endTime ?? ''}`,
        });
        if (linked.has(event.id)) el.addClass('horizon-block--has-note');
        el.setAttribute('aria-label', `${event.startTime ?? ''} ${event.title}`);
        attachActivation(el, eventChip(this.ctx, key, event, linked.has(event.id)));
      } else {
        const { note } = block;
        el.addClass('horizon-block--note');
        el.dataset.path = note.path;
        el.dataset.kind = 'note';
        el.createDiv({ cls: 'horizon-block__title', text: note.title });
        el.createDiv({ cls: 'horizon-block__time', text: note.time ?? '' });
        el.setAttribute('aria-label', `${note.time ?? ''} ${note.title}`);
      }
    }
  }

  /** Red line at the current time on today's column; re-placed every minute. */
  private placeNowLine(): void {
    const today = todayKey();
    for (const line of Array.from(this.containerEl.querySelectorAll('.horizon-week__now'))) {
      line.remove();
    }
    const col = this.containerEl.querySelector<HTMLElement>(
      `.horizon-week__daycol[data-key="${today}"]`,
    );
    if (!col) return;
    const minutes = minutesInDay(Date.now(), midnight(today));
    const line = col.createDiv({ cls: 'horizon-week__now' });
    line.setCssProps({ top: `${(minutes / 60) * HOUR_PX}px` });
  }

  private readonly handleClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
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
    const chipEl = target.closest<HTMLElement>('.horizon-chip, .horizon-block--note');
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
    const chipEl = target.closest<HTMLElement>('.horizon-chip, .horizon-block--note');
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
    const chipEl = target.closest<HTMLElement>('.horizon-chip, .horizon-block--note');
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
