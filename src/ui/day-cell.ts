import { compareDayKeys, parseDayKey } from '../dates.ts';
import type { DayBucket, DayKey } from '../types.ts';
import type { HorizonContext } from './context.ts';
import { TASK_MIME } from './dnd.ts';

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
    dots.push({ cls: 'horizon-dot--note', title: 'Nota giornaliera' });
  }
  if (!bucket) return dots;
  const openDue = bucket.due.filter((t) => !t.done && t.status !== '-');
  if (settings.showDue && openDue.length > 0) {
    const overdue = compareDayKeys(key, today) < 0;
    dots.push({
      cls: overdue ? 'horizon-dot--overdue' : 'horizon-dot--due',
      title: overdue ? `${openDue.length} task in ritardo` : `${openDue.length} task in scadenza`,
    });
  }
  if (settings.showScheduled && bucket.scheduled.some((t) => !t.done)) {
    dots.push({ cls: 'horizon-dot--scheduled', title: 'Task pianificati' });
  }
  if (settings.showDone && bucket.done.length > 0) {
    dots.push({ cls: 'horizon-dot--done', title: 'Task completati' });
  }
  if (settings.showNotes && bucket.notes.length > 0) {
    dots.push({ cls: 'horizon-dot--notes', title: 'Note datate' });
  }
  return dots;
}

export interface ChipSpec {
  cls: string;
  label: string;
  path: string;
  line: number;
  rawText: string;
  kind: 'due' | 'scheduled' | 'done' | 'note';
  dayKey: DayKey;
  done: boolean;
  recurring: boolean;
}

/** Chips for the full-density cell, in display order: due, scheduled, notes, done. */
export function chipsForDay(
  ctx: HorizonContext,
  key: DayKey,
  today: DayKey,
): ChipSpec[] {
  const bucket = ctx.dayIndex.getBucket(key);
  if (!bucket) return [];
  const { settings } = ctx;
  const chips: ChipSpec[] = [];
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
  if (chip.kind === 'note') {
    el.createSpan({ cls: 'horizon-chip__marker' });
  } else {
    const check = el.createSpan({ cls: 'horizon-chip__check' });
    check.setAttribute('role', 'checkbox');
    check.setAttribute('aria-checked', String(chip.done));
    check.setAttribute('aria-label', chip.done ? 'Riapri task' : 'Completa task');
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
  onOverflow: (key: DayKey) => void;
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
  num.setAttribute('aria-label', `Nota del ${key}`);
  if (key === options.today && (options.overdueCount ?? 0) > 0) {
    const badge = head.createSpan({
      cls: 'horizon-cell__overdue-badge',
      text: `\u21a9 ${options.overdueCount}`,
    });
    badge.tabIndex = 0;
    badge.setAttribute('role', 'button');
    badge.setAttribute('aria-label', `${options.overdueCount} task in ritardo`);
  }

  const chips = chipsForDay(ctx, key, options.today);
  const chipsEl = cell.createDiv({ cls: 'horizon-cell__chips' });
  const visible = chips.length > MAX_CHIPS_PER_CELL ? chips.slice(0, MAX_CHIPS_PER_CELL - 1) : chips;
  for (const chip of visible) renderChip(chipsEl, chip);
  const hidden = chips.length - visible.length;
  if (hidden > 0) {
    const more = chipsEl.createDiv({
      cls: 'horizon-chip horizon-chip--more',
      text: `+${hidden} altri`,
    });
    more.tabIndex = 0;
    more.setAttribute('role', 'button');
    more.addEventListener('click', (event) => {
      event.stopPropagation();
      callbacks.onOverflow(key);
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
    badge.setAttribute('aria-label', `${options.overdueCount} task in ritardo`);
  }

  const bucket = ctx.dayIndex.getBucket(key);
  const dots = miniDots(ctx, key, bucket, options.today);
  if (dots.length > 0) {
    const dotsEl = cell.createDiv({ cls: 'horizon-cell__dots' });
    for (const dot of dots) {
      dotsEl.createSpan({ cls: `horizon-dot ${dot.cls}`, attr: { 'aria-label': dot.title } });
    }
  }
  return cell;
}
