import { MarkdownView, setIcon, type TFile } from 'obsidian';

import { addDays } from '../dates.ts';
import { ensurePeriodicNote, openPeriodicNote } from '../edits/note-creator.ts';
import type { DayKey } from '../types.ts';
import type { HorizonContext } from './context.ts';
import { formatDayLabel, resolveDailyKey } from './daybar-core.ts';
import { showDatePicker } from './date-picker.ts';

const PILL_CLASS = 'horizon-daybar';

/** Build the pill element for a given daily `key`, wired to nav + picker. */
function buildPill(ctx: HorizonContext, key: DayKey): HTMLElement {
  const pill = createDiv({ cls: PILL_CLASS });
  let pending: DayKey | null = null;

  const render = (): void => {
    pill.empty();
    pill.toggleClass('is-pending', pending !== null);
    const shownKey = pending ?? key;

    // Icon controls use Obsidian's native `.clickable-icon` div (not a
    // <button>): themes like Cosmos give plain <button>s a filled resting
    // background, while `.clickable-icon` is the transparent icon-button
    // primitive they skin — and it defines --icon-size so the svg renders.
    const prev = pill.createDiv({ cls: 'clickable-icon horizon-daybar-arrow' });
    setIcon(prev, 'chevron-left');
    prev.setAttribute('aria-label', 'Giorno precedente');
    prev.onclick = () => void step(-1);

    const label = pill.createDiv({
      cls: 'horizon-daybar-label',
      text: formatDayLabel(ctx.moment, shownKey),
    });
    label.onclick = () => {
      if (pending) {
        // Confirm: create the pending day and open it.
        void createAndOpen(pending);
        return;
      }
      showDatePicker(ctx, pill, key, (picked) => {
        void openPeriodicNote(ctx, 'daily', picked, false);
      });
    };

    if (pending) {
      const create = pill.createDiv({ cls: 'clickable-icon horizon-daybar-create' });
      setIcon(create, 'plus');
      create.setAttribute('aria-label', 'Crea questa nota');
      create.onclick = () => void createAndOpen(pending as DayKey);
    }

    const next = pill.createDiv({ cls: 'clickable-icon horizon-daybar-arrow' });
    setIcon(next, 'chevron-right');
    next.setAttribute('aria-label', 'Giorno successivo');
    next.onclick = () => void step(1);
  };

  const step = async (dir: 1 | -1): Promise<void> => {
    const target = addDays(pending ?? key, dir);
    const exists = ctx.periodic.noteFor('daily', target) !== null;
    if (exists) {
      pending = null;
      await openPeriodicNote(ctx, 'daily', target, false); // instant nav; view re-syncs
      return;
    }
    // Empty day: park in pending state, create only on explicit click.
    pending = target;
    render();
  };

  const createAndOpen = async (target: DayKey): Promise<void> => {
    pending = null;
    const file = await ensurePeriodicNote(ctx, 'daily', target);
    if (file) {
      await ctx.app.workspace.getLeaf(false).openFile(file);
    }
  };

  render();
  return pill;
}

export class DaybarManager {
  private readonly ctx: HorizonContext;

  constructor(ctx: HorizonContext) {
    this.ctx = ctx;
  }

  /** Mount/remove the pill on every open markdown leaf to match current state. */
  syncAll(): void {
    for (const leaf of this.ctx.app.workspace.getLeavesOfType('markdown')) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) continue;
      this.syncView(view);
    }
  }

  private syncView(view: MarkdownView): void {
    const actions = view.containerEl.querySelector<HTMLElement>('.view-header .view-actions');
    if (!actions) return;
    // Idempotent: strip any existing pill, then re-add if this is a daily.
    actions.querySelectorAll(`.${PILL_CLASS}`).forEach((el) => el.remove());

    const file: TFile | null = view.file;
    const daily = this.ctx.settings.periods.daily;
    if (!file || !this.ctx.settings.daybar || !daily.enabled) return;
    const key = resolveDailyKey(this.ctx.moment, daily.folder, daily.format, file.path);
    if (!key) return;

    const pill = buildPill(this.ctx, key);
    actions.prepend(pill);
  }

  destroy(): void {
    for (const leaf of this.ctx.app.workspace.getLeavesOfType('markdown')) {
      const view = leaf.view;
      if (view instanceof MarkdownView) {
        view.containerEl
          .querySelectorAll(`.${PILL_CLASS}`)
          .forEach((el) => el.remove());
      }
    }
  }
}
