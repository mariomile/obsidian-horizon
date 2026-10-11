import { compareDayKeys, parseDayKey } from '../dates.ts';
import type { CalEvent } from '../gcal/events.ts';
import type { DayBucket, DayKey } from '../types.ts';
import type { HorizonContext } from './context.ts';
import { TASK_MIME } from './dnd.ts';
import { showEventMenu } from './event-menu.ts';
import { makeButtonLike } from './interactive.ts';

export interface DayCellOptions {
  /** Month currently displayed by the grid, to dim spill-over days. */
  displayedMonth: { y: number; m: number };
  today: DayKey;
  /** Open overdue tasks as of today; rendered as a badge on today's cell only. */
  overdueCount?: number;
}

interface DotSpec {
  cls: string;
  title: string;
}

function miniDots(ctx: HorizonContext, key: DayKey, bucket: DayBucket | null, today: DayKey): DotSpec[] {
  const dots: DotSpec[] = [];
  const { settings } = ctx;
  if (ctx.periodic.noteFor('daily', key)) {
    dots.push({ cls: 'horizon-dot--note', title: 'Daily note' });
  }
  if (ctx.proposals.forDay(key).length > 0) {
    dots.push({ cls: 'horizon-dot--ghost', title: 'Agent proposals' });
  }
  if (!bucket) return dots;
  const openDue = bucket.due.filter((t) => !t.done && t.status !== '-');
  if (settings.showDue && openDue.length > 0) {
    const overdue = compareDayKeys(key, today) < 0;
    dots.push({
      cls: overdue ? 'horizon-dot--overdue' : 'horizon-dot--due',
      title: overdue ? `${openDue.length} overdue tasks` : `${openDue.length} due tasks`,
    });
  }
  if (settings.showScheduled && bucket.scheduled.some((t) => !t.done)) {
    dots.push({ cls: 'horizon-dot--scheduled', title: 'Scheduled tasks' });
  }
  if (settings.showDone && bucket.done.length > 0) {
    dots.push({ cls: 'horizon-dot--done', title: 'Done tasks' });
  }
  if (settings.showNotes && bucket.notes.length > 0) {
    dots.push({ cls: 'horizon-dot--notes', title: 'Dated notes' });
  }
  return dots;
}

function withEventDot(ctx: HorizonContext, key: DayKey, dots: DotSpec[]): DotSpec[] {
  if (ctx.gcal.eventsOn(key).length > 0) {
    dots.push({ cls: 'horizon-dot--event', title: 'Calendar events' });
  }
  return dots;
}

export interface ChipSpec {
  cls: string;
  label: string;
  path: string;
  line: number;
  rawText: string;
  kind: 'due' | 'scheduled' | 'done' | 'note' | 'ghost' | 'event';
  dayKey: DayKey;
  done: boolean;
  recurring: boolean;
  proposalId?: string;
  reason?: string;
  event?: CalEvent;
  /** Event chips: a meeting note already exists for it. */
  hasNote?: boolean;
  /** Own activation handler (event chips), instead of the view's delegated one. */
  onActivate?: (el: HTMLElement, event: MouseEvent | KeyboardEvent) => void;
}

/** Event ids that already have a meeting note on `key`. */
export function linkedEventIds(ctx: HorizonContext, key: DayKey): Set<string> {
  const ids = new Set<string>();
  for (const note of ctx.dayIndex.getBucket(key)?.notes ?? []) {
    if (note.eventId !== undefined) ids.add(note.eventId);
  }
  return ids;
}

/** Chip label for an event: time prefix for timed events. */
export function eventLabel(event: CalEvent): string {
  return event.startTime ? `${event.startTime} · ${event.title}` : event.title;
}

export function eventChip(ctx: HorizonContext, key: DayKey, event: CalEvent, hasNote: boolean): ChipSpec {
  return {
    cls: `horizon-chip--event${event.allDay ? ' horizon-chip--allday' : ''}`,
    label: eventLabel(event),
    path: '',
    line: -1,
    rawText: '',
    kind: 'event',
    dayKey: key,
    done: false,
    recurring: false,
    event,
    hasNote,
    onActivate: (el, domEvent) => showEventMenu(ctx, event, el, domEvent),
  };
}

/** Chips for the full-density cell, in display order: due, scheduled, notes, done. */
export function chipsForDay(
  ctx: HorizonContext,
  key: DayKey,
  today: DayKey,
): ChipSpec[] {
  const bucket = ctx.dayIndex.getBucket(key) ?? { due: [], scheduled: [], done: [], notes: [] };
  const { settings } = ctx;
  const chips: ChipSpec[] = [];
  const events = ctx.gcal.eventsOn(key);
  const linked = linkedEventIds(ctx, key);
  const shownEvents = new Set(events.map((e) => e.id));
  for (const event of events) chips.push(eventChip(ctx, key, event, linked.has(event.id)));
  if (settings.showDue) {
    for (const task of bucket.due) {
      if (task.done || task.status === '-') continue;
      const overdue = compareDayKeys(key, today) < 0;
      chips.push({
        cls: `horizon-chip--due${overdue ? ' horizon-chip--overdue' : ''}`,
        label: task.description,
        path: task.path,
        line: task.line,
        rawText: task.rawText,
        kind: 'due',
        dayKey: key,
        done: false,
        recurring: task.recurring,
      });
    }
  }
  if (settings.showScheduled) {
    for (const task of bucket.scheduled) {
      if (task.done || task.status === '-') continue;
      chips.push({
        cls: 'horizon-chip--scheduled',
        label: task.description,
        path: task.path,
        line: task.line,
        rawText: task.rawText,
        kind: 'scheduled',
        dayKey: key,
        done: false,
        recurring: task.recurring,
      });
    }
  }
  if (settings.showNotes) {
    for (const note of bucket.notes) {
      // A meeting note rides on its event chip instead of showing twice.
      if (note.eventId !== undefined && shownEvents.has(note.eventId)) continue;
      chips.push({
        cls: 'horizon-chip--note',
        label: note.time ? `${note.time} · ${note.title}` : note.title,
        path: note.path,
        line: -1,
        rawText: '',
        kind: 'note',
        dayKey: key,
        done: false,
        recurring: false,
      });
    }
  }
  for (const proposal of ctx.proposals.forDay(key)) {
    chips.push({
      cls: 'horizon-chip--ghost',
      label: proposal.kind === 'new-task' ? proposal.text : `move here: ${proposal.rawText.slice(0, 60)}`,
      path: proposal.kind === 'reschedule' ? proposal.path : '',
      line: proposal.kind === 'reschedule' ? proposal.line : -1,
      rawText: '',
      kind: 'ghost',
      dayKey: key,
      done: false,
      recurring: false,
      proposalId: proposal.id,
      reason: proposal.reason,
    });
  }
  if (settings.showDone) {
    for (const task of bucket.done) {
      chips.push({
        cls: 'horizon-chip--done',
        label: task.description,
        path: task.path,
        line: task.line,
        rawText: task.rawText,
        kind: 'done',
        dayKey: key,
        done: true,
        recurring: task.recurring,
      });
    }
  }
  return chips;
}

export function renderChip(parent: HTMLElement, chip: ChipSpec): HTMLElement {
  const el = parent.createDiv({ cls: `horizon-chip ${chip.cls}` });
  el.dataset.path = chip.path;
  el.dataset.kind = chip.kind;
  el.dataset.key = chip.dayKey;
  if (chip.line >= 0) el.dataset.line = String(chip.line);
  if (chip.rawText !== '') el.dataset.raw = chip.rawText;
  el.tabIndex = 0;
  el.setAttribute('role', 'button');
  if (chip.kind === 'ghost') {
    if (chip.proposalId !== undefined) el.dataset.proposal = chip.proposalId;
    if (chip.reason !== undefined) el.setAttribute('title', chip.reason);
    el.createSpan({ cls: 'horizon-chip__marker horizon-chip__marker--ghost', text: '\u2726' });
    el.createSpan({ cls: 'horizon-chip__label', text: chip.label });
    const accept = el.createSpan({ cls: 'horizon-ghost__accept', text: '\u2713' });
    accept.setAttribute('role', 'button');
    accept.setAttribute('aria-label', 'Accept proposal');
    const dismiss = el.createSpan({ cls: 'horizon-ghost__dismiss', text: '\u2715' });
    dismiss.setAttribute('role', 'button');
    dismiss.setAttribute('aria-label', 'Dismiss proposal');
    el.setAttribute('aria-label', chip.label);
    return el;
  }
  if (chip.kind === 'event' && chip.event) {
    renderEventChipBody(el, chip, chip.event);
    return el;
  }
  if (chip.kind === 'note') {
    el.createSpan({ cls: 'horizon-chip__marker' });
  } else {
    const check = el.createSpan({ cls: 'horizon-chip__check' });
    check.setAttribute('role', 'checkbox');
    check.setAttribute('aria-checked', String(chip.done));
    check.setAttribute('aria-label', chip.done ? 'Reopen task' : 'Complete task');
  }
  el.createSpan({ cls: 'horizon-chip__label', text: chip.label });
  if (chip.recurring) el.createSpan({ cls: 'horizon-chip__badge', text: '🔁' });
  el.setAttribute('aria-label', chip.label);
  if (chip.kind !== 'note') {
    el.draggable = true;
    el.addEventListener('dragstart', (event) => {
      if (!event.dataTransfer) return;
      event.dataTransfer.setData(
        TASK_MIME,
        JSON.stringify({
          path: chip.path,
          line: chip.line,
          rawText: chip.rawText,
          dateKind: chip.kind,
          fromKey: chip.dayKey,
        }),
      );
      event.dataTransfer.effectAllowed = 'move';
      el.addClass('horizon-chip--dragging');
    });
    el.addEventListener('dragend', () => el.removeClass('horizon-chip--dragging'));
  }
  return el;
}

function renderEventChipBody(el: HTMLElement, chip: ChipSpec, event: CalEvent): void {
  if (event.color !== '') el.setCssProps({ '--horizon-event-color': event.color });
  el.createSpan({ cls: 'horizon-chip__marker horizon-chip__marker--event' });
  el.createSpan({ cls: 'horizon-chip__label', text: chip.label });
  if (chip.hasNote) {
    el.createSpan({ cls: 'horizon-chip__badge horizon-chip__badge--note', attr: { 'aria-label': 'Has a meeting note' } });
  }
  el.setAttribute('aria-label', chip.label);
  el.setAttribute('aria-haspopup', 'menu');
  attachActivation(el, chip);
}

/** Wire a chip's own activation handler, keeping it out of the view's delegated handlers. */
export function attachActivation(el: HTMLElement, chip: ChipSpec): void {
  const activate = chip.onActivate;
  if (!activate) return;
  el.addEventListener('click', (event) => {
    event.stopPropagation();
    activate(el, event);
  });
  el.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    activate(el, event);
  });
}

/** Rebuild the guarded task reference carried by a chip's data attributes. */
export function taskRefFromChip(
  chipEl: HTMLElement,
): { path: string; line: number; rawText: string } | null {
  const { path, line, raw } = chipEl.dataset;
  if (path === undefined || line === undefined || raw === undefined) return null;
  const lineNumber = Number(line);
  if (!Number.isInteger(lineNumber) || lineNumber < 0) return null;
  return { path, line: lineNumber, rawText: raw };
}

export interface FullDayCellCallbacks {
  onOverflow: (key: DayKey, anchorEl: HTMLElement, event: MouseEvent) => void;
}

const MAX_CHIPS_PER_CELL = 4;

/** Render one full-density day cell (month grid of the tab view). */
export function renderFullDayCell(
  ctx: HorizonContext,
  parent: HTMLElement,
  key: DayKey,
  options: DayCellOptions,
  callbacks: FullDayCellCallbacks,
): HTMLElement {
  const ymd = parseDayKey(key);
  const cell = parent.createDiv({ cls: 'horizon-cell horizon-cell--full' });
  cell.dataset.key = key;
  if (!ymd) return cell;

  if (ymd.m !== options.displayedMonth.m) cell.addClass('horizon-cell--other-month');
  if (key === options.today) cell.addClass('horizon-cell--today');
  if (ctx.periodic.noteFor('daily', key)) cell.addClass('horizon-cell--has-note');

  const head = cell.createDiv({ cls: 'horizon-cell__head' });
  const num = head.createSpan({ cls: 'horizon-cell__num', text: String(ymd.d) });
  num.dataset.key = key;
  num.tabIndex = 0;
  num.setAttribute('role', 'button');
  num.setAttribute('aria-label', `Note for ${key}`);
  if (key === options.today && (options.overdueCount ?? 0) > 0) {
    const badge = head.createSpan({
      cls: 'horizon-cell__overdue-badge',
      text: `\u21a9 ${options.overdueCount}`,
    });
    makeButtonLike(badge, `${options.overdueCount} overdue tasks`);
  }

  const chips = chipsForDay(ctx, key, options.today);
  const chipsEl = cell.createDiv({ cls: 'horizon-cell__chips' });
  const visible = chips.length > MAX_CHIPS_PER_CELL ? chips.slice(0, MAX_CHIPS_PER_CELL - 1) : chips;
  for (const chip of visible) renderChip(chipsEl, chip);
  const hidden = chips.length - visible.length;
  if (hidden > 0) {
    const more = chipsEl.createDiv({
      cls: 'horizon-chip horizon-chip--more',
      text: `+${hidden} more`,
    });
    makeButtonLike(more, `Show ${hidden} more items`);
    more.addEventListener('click', (event) => {
      event.stopPropagation();
      callbacks.onOverflow(key, more, event);
    });
  }
  return cell;
}

/** Render one mini day cell into `parent`. Interaction is delegated at grid level via data-key. */
export function renderMiniDayCell(
  ctx: HorizonContext,
  parent: HTMLElement,
  key: DayKey,
  options: DayCellOptions,
): HTMLElement {
  const ymd = parseDayKey(key);
  const cell = parent.createDiv({ cls: 'horizon-cell horizon-cell--mini' });
  cell.dataset.key = key;
  cell.tabIndex = 0;
  cell.setAttribute('role', 'button');
  if (!ymd) return cell;

  if (ymd.m !== options.displayedMonth.m) cell.addClass('horizon-cell--other-month');
  if (key === options.today) cell.addClass('horizon-cell--today');
  if (key === ctx.uiState.activeDate) cell.addClass('horizon-cell--active');
  if (ctx.periodic.noteFor('daily', key)) cell.addClass('horizon-cell--has-note');

  cell.createSpan({ cls: 'horizon-cell__num', text: String(ymd.d) });
  if (key === options.today && (options.overdueCount ?? 0) > 0) {
    const badge = cell.createSpan({
      cls: 'horizon-cell__mini-badge',
      text: String(options.overdueCount),
    });
    badge.setAttribute('aria-label', `${options.overdueCount} overdue tasks`);
  }

  const bucket = ctx.dayIndex.getBucket(key);
  const dots = withEventDot(ctx, key, miniDots(ctx, key, bucket, options.today));
  if (dots.length > 0) {
    const dotsEl = cell.createDiv({ cls: 'horizon-cell__dots' });
    for (const dot of dots) {
      dotsEl.createSpan({ cls: `horizon-dot ${dot.cls}`, attr: { 'aria-label': dot.title } });
    }
  }
  return cell;
}
