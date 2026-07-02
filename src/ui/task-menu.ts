import { Menu } from 'obsidian';

import { addDays, nextMonday, todayKey } from '../dates.ts';
import { openAtLine, rescheduleTask } from '../edits/task-edit.ts';
import type { TaskDateKind } from '../types.ts';
import type { HorizonContext } from './context.ts';
import { taskRefFromChip } from './day-cell.ts';

/**
 * Snooze/context menu for a task chip: preset date targets (email-triage
 * pattern) plus open-at-line. Done chips only get open-at-line.
 */
export function showTaskChipMenu(
  ctx: HorizonContext,
  chipEl: HTMLElement,
  event: MouseEvent,
): void {
  const ref = taskRefFromChip(chipEl);
  if (!ref) return;
  const kind = chipEl.dataset.kind as TaskDateKind | undefined;
  const menu = new Menu();

  if (kind === 'due' || kind === 'scheduled') {
    const today = todayKey();
    const currentDay = chipEl.dataset.key ?? today;
    const presets: Array<{ title: string; key: string }> = [
      { title: 'Sposta a oggi', key: today },
      { title: 'Domani', key: addDays(today, 1) },
      { title: 'Lunedì prossimo', key: nextMonday(today) },
      { title: '+1 settimana', key: addDays(currentDay, 7) },
    ];
    for (const preset of presets) {
      if (preset.key === currentDay) continue;
      menu.addItem((item) =>
        item
          .setTitle(preset.title)
          .setIcon('calendar-clock')
          .onClick(() => {
            void rescheduleTask(ctx, ref, kind, preset.key);
          }),
      );
    }
    menu.addSeparator();
  }

  menu.addItem((item) =>
    item
      .setTitle('Apri al rigo')
      .setIcon('file-text')
      .onClick(() => {
        void openAtLine(ctx, ref);
      }),
  );
  menu.showAtMouseEvent(event);
}
