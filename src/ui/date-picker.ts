import { setIcon } from 'obsidian';

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
    // Reuse Horizon's own calendar skin so the picker reads as the same
    // component as the sidebar mini-calendar (and inherits theme overrides).
    const cal = pop.createDiv({ cls: 'horizon-cal' });

    const header = cal.createDiv({ cls: 'horizon-cal__header' });
    header.createDiv({
      cls: 'horizon-cal__title',
      text: ctx.moment(month, 'YYYY-MM-DD', true).format('MMMM YYYY'),
    });
    const nav = header.createDiv({ cls: 'horizon-cal__nav' });
    // Native `.clickable-icon` divs: transparent resting state under Cosmos
    // (which fills plain <button>s) and correct icon sizing via --icon-size.
    const prevBtn = nav.createDiv({ cls: 'clickable-icon' });
    setIcon(prevBtn, 'chevron-left');
    prevBtn.setAttribute('aria-label', 'Mese precedente');
    prevBtn.onclick = () => {
      month = addMonths(month, -1);
      render();
    };
    const todayBtn = nav.createDiv({ cls: 'clickable-icon' });
    setIcon(todayBtn, 'circle-dot');
    todayBtn.setAttribute('aria-label', 'Oggi');
    todayBtn.onclick = () => {
      month = todayKey();
      render();
    };
    const nextBtn = nav.createDiv({ cls: 'clickable-icon' });
    setIcon(nextBtn, 'chevron-right');
    nextBtn.setAttribute('aria-label', 'Mese successivo');
    nextBtn.onclick = () => {
      month = addMonths(month, 1);
      render();
    };

    const grid = cal.createDiv({ cls: 'horizon-cal__grid' });
    for (const wd of WEEKDAYS) grid.createDiv({ cls: 'horizon-cal__dow', text: wd });

    const cells = buildPickerCells(month, {
      currentKey,
      todayKey: todayKey(),
      hasNote: (key) => ctx.periodic.noteFor('daily', key) !== null,
    });
    for (const cell of cells) {
      const day = parseDayKey(cell.key);
      const el = grid.createDiv({ cls: 'horizon-cell--mini' });
      el.toggleClass('horizon-cell--other-month', !cell.inMonth);
      el.toggleClass('horizon-cell--today', cell.isToday);
      el.toggleClass('horizon-cell--active', cell.isCurrent);
      el.toggleClass('horizon-cell--has-note', cell.hasNote);
      el.createDiv({ cls: 'horizon-cell__num', text: String(day?.d ?? '') });
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
