import {
  BasesView,
  Keymap,
  setIcon,
  type BasesAllOptions,
  type BasesEntry,
  type HoverPopover,
  type QueryController,
} from 'obsidian';

import { addDays, addMonths, dayKey, isoWeek, monthGrid, parseDayKey, todayKey } from '../dates.ts';
import { normalizeFrontmatterDate } from '../index/frontmatter-date.ts';
import type { DayKey } from '../types.ts';
import type { HorizonContext } from './context.ts';
import { renderChipOrCard } from './note-card.ts';

export const BASES_CALENDAR_VIEW_TYPE = 'horizon';

interface BaseDayEntry {
  path: string;
  title: string;
  time: string | null;
}

/**
 * Calendar layout for Obsidian Bases: the Base decides WHICH notes (filters +
 * a configurable date property), Horizon decides WHEN. Read-only month grid —
 * click opens, hover previews.
 */
export class HorizonBasesView extends BasesView {
  readonly type = BASES_CALENDAR_VIEW_TYPE;
  hoverPopover: HoverPopover | null = null;
  private readonly ctx: HorizonContext;
  private readonly rootEl: HTMLElement;
  private byDay = new Map<DayKey, BaseDayEntry[]>();
  private displayed: { y: number; m: number };

  constructor(controller: QueryController, containerEl: HTMLElement, ctx: HorizonContext) {
    super(controller);
    this.ctx = ctx;
    const today = parseDayKey(todayKey());
    this.displayed = today ? { y: today.y, m: today.m } : { y: 2026, m: 1 };
    this.rootEl = containerEl.createDiv({ cls: 'horizon-bases' });
    this.rootEl.addEventListener('click', this.handleClick);
    this.rootEl.addEventListener('mouseover', this.handleHover);
  }

  onunload(): void {
    this.rootEl.removeEventListener('click', this.handleClick);
    this.rootEl.removeEventListener('mouseover', this.handleHover);
    this.rootEl.remove();
  }

  static getViewOptions(): BasesAllOptions[] {
    return [
      {
        displayName: 'Proprietà data',
        type: 'text',
        key: 'dateProperty',
        default: 'date',
      },
      {
        displayName: 'Numeri di settimana',
        type: 'toggle',
        key: 'showWeekNumbers',
        default: true,
      },
    ];
  }

  onDataUpdated(): void {
    const property = this.textOption('dateProperty', 'date');
    this.byDay = new Map();
    for (const group of this.data.groupedData) {
      for (const entry of group.entries) {
        const parsed = this.entryDate(entry, property);
        if (!parsed) continue;
        const list = this.byDay.get(parsed.day) ?? [];
        list.push({ path: entry.file.path, title: entry.file.basename, time: parsed.time });
        this.byDay.set(parsed.day, list);
      }
    }
    for (const list of this.byDay.values()) {
      list.sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99'));
    }
    this.render();
  }

  private entryDate(
    entry: BasesEntry,
    property: string,
  ): { day: DayKey; time: string | null } | null {
    for (const id of [`note.${property}`, property]) {
      let value: unknown;
      try {
        value = entry.getValue(id as never);
      } catch {
        continue;
      }
      const text = value?.toString();
      if (text === undefined || text === '') continue;
      const parsed = normalizeFrontmatterDate(text);
      if (parsed) return parsed;
    }
    return null;
  }

  private render(): void {
    const el = this.rootEl;
    el.empty();
    const today = todayKey();
    const showWeeks = this.booleanOption('showWeekNumbers', true);

    const header = el.createDiv({ cls: 'horizon-cal__header' });
    header.createSpan({
      cls: 'horizon-cal__title',
      text: this.ctx
        .moment(dayKey(this.displayed.y, this.displayed.m, 1), 'YYYY-MM-DD', true)
        .format('MMMM YYYY'),
    });
    const nav = header.createDiv({ cls: 'horizon-cal__nav' });
    this.navButton(nav, 'chevron-left', 'Mese precedente', () => this.step(-1));
    this.navButton(nav, 'circle-dot', 'Oggi', () => {
      const t = parseDayKey(today);
      if (t) this.displayed = { y: t.y, m: t.m };
      this.render();
    });
    this.navButton(nav, 'chevron-right', 'Mese successivo', () => this.step(1));

    const grid = el.createDiv({
      cls: `horizon-month__grid${showWeeks ? ' horizon-month__grid--weeks' : ''}`,
    });
    const cells = monthGrid(this.displayed.y, this.displayed.m);
    const monday = cells[0] ?? dayKey(this.displayed.y, this.displayed.m, 1);
    if (showWeeks) grid.createSpan({ cls: 'horizon-month__dow' });
    for (let i = 0; i < 7; i++) {
      grid.createSpan({
        cls: 'horizon-month__dow',
        text: this.ctx.moment(addDays(monday, i), 'YYYY-MM-DD', true).format('ddd'),
      });
    }
    for (let week = 0; week < 6; week++) {
      const weekStart = cells[week * 7];
      if (weekStart === undefined) break;
      if (showWeeks) {
        grid.createSpan({
          cls: 'horizon-cal__weeknum horizon-month__weeknum',
          text: String(isoWeek(weekStart).week),
        });
      }
      for (let i = 0; i < 7; i++) {
        const key = cells[week * 7 + i];
        if (key === undefined) continue;
        this.renderCell(grid, key, today);
      }
    }
  }

  private renderCell(grid: HTMLElement, key: DayKey, today: DayKey): void {
    const ymd = parseDayKey(key);
    const cell = grid.createDiv({ cls: 'horizon-cell horizon-cell--full' });
    cell.dataset.key = key;
    if (!ymd) return;
    if (ymd.m !== this.displayed.m) cell.addClass('horizon-cell--other-month');
    if (key === today) cell.addClass('horizon-cell--today');
    const head = cell.createDiv({ cls: 'horizon-cell__head' });
    head.createSpan({ cls: 'horizon-cell__num', text: String(ymd.d) });
    const chipsEl = cell.createDiv({ cls: 'horizon-cell__chips' });
    for (const entry of this.byDay.get(key) ?? []) {
      renderChipOrCard(this.ctx, chipsEl, {
        cls: 'horizon-chip--note',
        label: entry.time ? `${entry.time} · ${entry.title}` : entry.title,
        path: entry.path,
        line: -1,
        rawText: '',
        kind: 'note',
        dayKey: key,
        done: false,
        recurring: false,
      });
    }
  }

  private step(direction: 1 | -1): void {
    const next = parseDayKey(addMonths(dayKey(this.displayed.y, this.displayed.m, 1), direction));
    if (!next) return;
    this.displayed = { y: next.y, m: next.m };
    this.render();
  }

  private navButton(parent: HTMLElement, icon: string, label: string, onClick: () => void): void {
    const button = parent.createEl('button', { cls: 'clickable-icon horizon-cal__nav-btn' });
    button.setAttribute('aria-label', label);
    setIcon(button, icon);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      onClick();
    });
  }

  private textOption(key: string, fallback: string): string {
    const value = this.config.get(key);
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
  }

  private booleanOption(key: string, fallback: boolean): boolean {
    const value = this.config.get(key);
    return typeof value === 'boolean' ? value : fallback;
  }

  private readonly handleClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const chipEl = target.closest<HTMLElement>('.horizon-chip');
    if (!chipEl?.dataset.path) return;
    void this.app.workspace.openLinkText(
      chipEl.dataset.path,
      '',
      Keymap.isModEvent(event),
    );
  };

  private readonly handleHover = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const chipEl = target.closest<HTMLElement>('.horizon-chip');
    if (!chipEl?.dataset.path) return;
    const related = event.relatedTarget;
    if (related instanceof Node && chipEl.contains(related)) return;
    this.app.workspace.trigger('hover-link', {
      event,
      source: 'horizon',
      hoverParent: this,
      targetEl: chipEl,
      linktext: chipEl.dataset.path,
      sourcePath: '',
    });
  };
}
