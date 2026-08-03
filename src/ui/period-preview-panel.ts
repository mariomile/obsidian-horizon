import { Component, Keymap } from 'obsidian';

import { startOfWeekMonday } from '../dates.ts';
import { openPeriodicNote } from '../edits/note-creator.ts';
import type { MomentLike } from '../index/periodic.ts';
import type { DayKey, Period } from '../types.ts';
import type { HorizonContext } from './context.ts';
import { makeButtonLike } from './interactive.ts';
import { populatePreviewBody } from './note-card.ts';
import { dailyHeading, weeklyHeading } from './period-preview-core.ts';

export interface PeriodPreviewPanelConfig {
  period: Period;
  keyFor: (activeDate: DayKey) => DayKey;
  heading: (moment: MomentLike, key: DayKey) => string;
  /** Multiplier on `settings.previewCharacters` — the week card shows more text than the lightweight day snippet. */
  previewScale: number;
}

export const DAILY_PANEL_CONFIG: PeriodPreviewPanelConfig = {
  period: 'daily',
  keyFor: (activeDate) => activeDate,
  heading: dailyHeading,
  previewScale: 1,
};

export const WEEKLY_PANEL_CONFIG: PeriodPreviewPanelConfig = {
  period: 'weekly',
  keyFor: startOfWeekMonday,
  heading: weeklyHeading,
  previewScale: 2.5,
};

/**
 * Persistent preview of the daily/weekly note for the active date, mounted
 * below the sidebar mini-calendar. Two instances (daily, weekly) share this
 * one implementation, parameterized by `PeriodPreviewPanelConfig`.
 */
export class PeriodPreviewPanel extends Component {
  private readonly ctx: HorizonContext;
  private readonly containerEl: HTMLElement;
  private readonly config: PeriodPreviewPanelConfig;

  constructor(ctx: HorizonContext, containerEl: HTMLElement, config: PeriodPreviewPanelConfig) {
    super();
    this.ctx = ctx;
    this.containerEl = containerEl;
    this.config = config;
  }

  onload(): void {
    this.containerEl.addClass('horizon-period-panel', `horizon-period-panel--${this.config.period}`);
    this.register(this.ctx.uiState.subscribe(() => this.render()));
    this.register(this.ctx.dayIndex.subscribe(() => this.render()));
    this.register(() => {
      this.containerEl.empty();
      this.containerEl.removeClass('horizon-period-panel', `horizon-period-panel--${this.config.period}`);
    });
    this.render();
  }

  render(): void {
    const el = this.containerEl;
    el.empty();
    const { period, keyFor, heading, previewScale } = this.config;

    if (!this.ctx.settings.notePreviewPanels || !this.ctx.settings.periods[period].enabled) {
      el.hide();
      return;
    }
    el.show();

    const key = keyFor(this.ctx.uiState.activeDate);
    el.createDiv({ cls: 'horizon-period-panel__heading', text: heading(this.ctx.moment, key) });

    const openThis = (event: MouseEvent): void => {
      void openPeriodicNote(this.ctx, period, key, Keymap.isModEvent(event));
    };

    const note = this.ctx.periodic.noteFor(period, key);
    if (note) {
      const card = el.createDiv({ cls: 'horizon-chip horizon-chip--card' });
      makeButtonLike(card, `Open ${note.basename}`);
      card.addEventListener('click', openThis);
      const body = card.createDiv({ cls: 'horizon-card__body' });
      body.createDiv({ cls: 'horizon-card__title', text: note.basename });
      const excerptEl = body.createDiv({ cls: 'horizon-card__excerpt' });
      populatePreviewBody(
        this.ctx,
        card,
        excerptEl,
        note,
        Math.round(this.ctx.settings.previewCharacters * previewScale),
      );
    } else {
      const empty = el.createDiv({ cls: 'horizon-period-panel__empty' });
      makeButtonLike(empty, `Create note for ${heading(this.ctx.moment, key)}`);
      empty.addEventListener('click', openThis);
      empty.createSpan({ cls: 'horizon-period-panel__empty-label', text: 'No note yet' });
      empty.createSpan({ cls: 'horizon-period-panel__empty-hint', text: 'Click to create' });
    }
  }
}
