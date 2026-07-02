import { chipsForDay } from './day-cell.ts';
import { renderChipOrCard } from './note-card.ts';
import { todayKey } from '../dates.ts';
import type { DayKey } from '../types.ts';
import type { HorizonContext } from './context.ts';
import { showTaskChipMenu } from './task-menu.ts';

export interface DayPopoverHandlers {
  onChipClick: (chipEl: HTMLElement, event: MouseEvent | KeyboardEvent) => void;
  onTaskToggle: (chipEl: HTMLElement) => void;
  onChipHover: (path: string, chipEl: HTMLElement, event: MouseEvent) => void;
}

/**
 * In-place popover listing every chip of a day — resolves month-cell overflow
 * without losing the month context. Chips keep all their interactions
 * (open, checkbox, contextmenu snooze, drag source).
 */
export function showDayPopover(
  ctx: HorizonContext,
  anchorEl: HTMLElement,
  key: DayKey,
  handlers: DayPopoverHandlers,
): void {
  document.querySelector('.horizon-popover')?.remove();

  const popover = document.body.createDiv({ cls: 'horizon-popover' });
  const title = ctx.moment(key, 'YYYY-MM-DD', true).format('dddd D MMMM');
  popover.createDiv({ cls: 'horizon-popover__title', text: title });
  const chipsEl = popover.createDiv({ cls: 'horizon-popover__chips' });
  for (const chip of chipsForDay(ctx, key, todayKey())) renderChipOrCard(ctx, chipsEl, chip);

  const rect = anchorEl.getBoundingClientRect();
  popover.style.left = `${Math.min(rect.left, window.innerWidth - 320)}px`;
  const below = rect.bottom + 8;
  popover.style.top =
    below + 260 < window.innerHeight ? `${below}px` : `${Math.max(8, rect.top - 268)}px`;

  const close = (): void => {
    popover.remove();
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('keydown', onKeyDown, true);
  };
  const onPointerDown = (event: PointerEvent): void => {
    if (event.target instanceof Node && popover.contains(event.target)) return;
    close();
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') close();
  };
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('keydown', onKeyDown, true);

  popover.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const checkEl = target.closest<HTMLElement>('.horizon-chip__check');
    if (checkEl) {
      const chipHost = checkEl.closest<HTMLElement>('.horizon-chip');
      if (chipHost) handlers.onTaskToggle(chipHost);
      close();
      return;
    }
    const chipEl = target.closest<HTMLElement>('.horizon-chip');
    if (chipEl?.dataset.path) {
      handlers.onChipClick(chipEl, event);
      close();
    }
  });
  popover.addEventListener('contextmenu', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const chipEl = target.closest<HTMLElement>('.horizon-chip');
    if (!chipEl?.dataset.raw) return;
    event.preventDefault();
    showTaskChipMenu(ctx, chipEl, event);
  });
  popover.addEventListener('mouseover', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const chipEl = target.closest<HTMLElement>('.horizon-chip');
    if (!chipEl?.dataset.path) return;
    const related = event.relatedTarget;
    if (related instanceof Node && chipEl.contains(related)) return;
    handlers.onChipHover(chipEl.dataset.path, chipEl, event);
  });
}
