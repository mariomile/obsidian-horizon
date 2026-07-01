import { compareDayKeys, parseDayKey } from '../dates.ts';
import type { DayBucket, DayKey } from '../types.ts';
import type { HorizonContext } from './context.ts';

export interface DayCellOptions {
  /** Month currently displayed by the grid, to dim spill-over days. */
  displayedMonth: { y: number; m: number };
  today: DayKey;
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
  const openDue = bucket.due.filter((t) => !t.done);
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
