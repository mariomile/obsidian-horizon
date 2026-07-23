import { addMonths, parseDayKey, todayKey } from '../dates.ts';
import type { DayKey } from '../types.ts';
import type { HorizonContext } from './context.ts';
import { buildPickerCells } from './daybar-core.ts';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export function showDatePicker(
  ctx: HorizonContext,
  anchor: HTMLElement,
  currentKey: DayKey,
  onPick: (key: DayKey) => void,
): void {
  const pop = document.body.createDiv({ cls: 'horizon-datepicker' });
  let month = currentKey; // any key inside the displayed month

  const close = (): void => {
    document.removeEventListener('mousedown', onOutside, true);
    document.removeEventListener('keydown', onKey, true);
    pop.remove();
  };
  const onOutside = (e: MouseEvent): void => {
    if (!pop.contains(e.target as Node) && !anchor.contains(e.target as Node)) close();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };

  const render = (): void => {
    pop.empty();
    const ymd = parseDayKey(month);
    if (!ymd) return;
    const header = pop.createDiv({ cls: 'horizon-dp-header' });
    header.createSpan({
      cls: 'horizon-dp-title',
      text: ctx.moment(month, 'YYYY-MM-DD', true).format('MMMM YYYY'),
    });
    const nav = header.createDiv({ cls: 'horizon-dp-nav' });
    nav.createEl('button', { cls: 'horizon-dp-btn', text: '‹' }).onclick = () => {
      month = addMonths(month, -1);
      render();
    };
    nav.createEl('button', { cls: 'horizon-dp-btn', text: '⊙' }).onclick = () => {
      month = todayKey();
      render();
    };
    nav.createEl('button', { cls: 'horizon-dp-btn', text: '›' }).onclick = () => {
      month = addMonths(month, 1);
      render();
    };

    const grid = pop.createDiv({ cls: 'horizon-dp-grid' });
    for (const wd of WEEKDAYS) grid.createSpan({ cls: 'horizon-dp-weekday', text: wd });

    const cells = buildPickerCells(month, {
      currentKey,
      todayKey: todayKey(),
      hasNote: (key) => ctx.periodic.noteFor('daily', key) !== null,
    });
    for (const cell of cells) {
      const day = parseDayKey(cell.key);
      const el = grid.createEl('button', {
        cls: 'horizon-dp-day',
        text: String(day?.d ?? ''),
      });
      el.toggleClass('is-out', !cell.inMonth);
      el.toggleClass('is-today', cell.isToday);
      el.toggleClass('is-current', cell.isCurrent);
      el.toggleClass('has-note', cell.hasNote);
      el.onclick = () => {
        onPick(cell.key);
        close();
      };
    }
  };

  render();

  // Anchor under the pill, right-aligned to it.
  const rect = anchor.getBoundingClientRect();
  pop.style.position = 'fixed';
  pop.style.top = `${rect.bottom + 4}px`;
  pop.style.left = `${Math.max(8, rect.right - pop.offsetWidth)}px`;

  document.addEventListener('mousedown', onOutside, true);
  document.addEventListener('keydown', onKey, true);
}
