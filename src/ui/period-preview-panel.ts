import { Component, Keymap, MarkdownRenderer, setIcon } from 'obsidian';

import { addDays, parseDayKey, startOfWeekMonday } from '../dates.ts';
import { openPeriodicNote } from '../edits/note-creator.ts';
import { createJournalPreview } from '../journal.ts';
import type { MomentLike } from '../index/periodic.ts';
import type { DayKey, Period } from '../types.ts';
import type { HorizonContext } from './context.ts';
import { makeButtonLike } from './interactive.ts';
import { weeklyHeading } from './period-preview-core.ts';

export interface PeriodPreviewPanelConfig {
  period: Period;
  keyFor: (activeDate: DayKey) => DayKey;
  heading: (moment: MomentLike, key: DayKey) => string;
  /** Multiplier on `settings.previewCharacters` — how much of the note's own markdown to render. */
  previewScale: number;
  /** Step the shared active date to the previous/next period, e.g. ±7 days for weekly. */
  step: (activeDate: DayKey, direction: 1 | -1) => DayKey;
}

export const WEEKLY_PANEL_CONFIG: PeriodPreviewPanelConfig = {
  period: 'weekly',
  keyFor: startOfWeekMonday,
  heading: weeklyHeading,
  previewScale: 2,
  step: (activeDate, direction) => addDays(activeDate, direction * 7),
};

/**
 * Persistent preview of a periodic note for the active date, mounted below
 * the sidebar mini-calendar. Configured via `PeriodPreviewPanelConfig` so a
 * future period (e.g. monthly) can reuse it without new plumbing.
 *
 * The preview renders the note's own markdown (via `MarkdownRenderer`, same
 * as journal-view.ts's feed) rather than a plain-text excerpt — headings,
 * bold, and lists show as they actually appear in the note.
 */
export class PeriodPreviewPanel extends Component {
  private readonly ctx: HorizonContext;
  private readonly containerEl: HTMLElement;
  private readonly config: PeriodPreviewPanelConfig;
  private renderer: Component | null = null;

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
    if (this.renderer) {
      this.removeChild(this.renderer);
      this.renderer = null;
    }
    const { period, keyFor, heading, previewScale } = this.config;

    if (!this.ctx.settings.notePreviewPanels || !this.ctx.settings.periods[period].enabled) {
      el.hide();
      return;
    }
    el.show();

    const key = keyFor(this.ctx.uiState.activeDate);
    const headingRow = el.createDiv({ cls: 'horizon-period-panel__heading-row' });
    this.navButton(headingRow, 'chevron-left', 'Previous period', -1);
    headingRow.createSpan({ cls: 'horizon-period-panel__heading', text: heading(this.ctx.moment, key) });
    this.navButton(headingRow, 'chevron-right', 'Next period', 1);

    const openThis = (event: MouseEvent): void => {
      // Let a real link inside the rendered preview navigate on its own —
      // only the surrounding card area opens the periodic note.
      if ((event.target as HTMLElement).closest('a, input')) return;
      void openPeriodicNote(this.ctx, period, key, Keymap.isModEvent(event));
    };

    const note = this.ctx.periodic.noteFor(period, key);
    if (note) {
      const card = el.createDiv({ cls: 'horizon-chip horizon-chip--card' });
      makeButtonLike(card, `Open ${note.basename}`);
      card.addEventListener('click', openThis);
      const wrap = card.createDiv({ cls: 'horizon-period-panel__markdown-wrap' });
      const body = wrap.createDiv({ cls: 'horizon-period-panel__markdown' });
      body.createSpan({ cls: 'horizon-period-panel__empty-label', text: 'Loading…' });

      const chars = Math.round(this.ctx.settings.previewCharacters * previewScale);
      void this.ctx.app.vault
        .cachedRead(note)
        .then((source) => {
          if (!card.isConnected) return;
          body.empty();
          const preview = createJournalPreview(source, chars);
          if (preview.markdown === '') {
            body.createSpan({ cls: 'horizon-period-panel__empty-label', text: 'Nothing written yet' });
            return;
          }
          this.renderer = this.addChild(new Component());
          void MarkdownRenderer.render(this.ctx.app, preview.markdown, body, note.path, this.renderer).then(
            () => {
              for (const checkbox of Array.from(
                body.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
              )) {
                checkbox.disabled = true;
              }
              // A soft fade only when the text itself was cut (never mid-line —
              // createJournalPreview always breaks on a whole markdown line) —
              // the fade never hides fully-shown content.
              if (preview.truncated) wrap.createDiv({ cls: 'horizon-period-panel__fade' });
            },
          );
        })
        .catch(() => {
          if (!card.isConnected) return;
          body.empty();
          body.createSpan({ cls: 'horizon-period-panel__empty-label', text: 'Could not load preview' });
        });
    } else {
      const empty = el.createDiv({ cls: 'horizon-period-panel__empty' });
      makeButtonLike(empty, `Create note for ${heading(this.ctx.moment, key)}`);
      empty.addEventListener('click', openThis);
      empty.createSpan({ cls: 'horizon-period-panel__empty-label', text: 'No note yet' });
      empty.createSpan({ cls: 'horizon-period-panel__empty-hint', text: 'Click to create' });
    }
  }

  private navButton(parent: HTMLElement, icon: string, label: string, direction: 1 | -1): void {
    // Native clickable-icon div, not a <button> — matches month-grid.ts's own
    // nav buttons (themes like Cosmos fill plain <button>s with a resting
    // background, reading as opaque bubbles).
    const button = parent.createDiv({ cls: 'clickable-icon horizon-cal__nav-btn' });
    makeButtonLike(button, label);
    setIcon(button, icon);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      this.step(direction);
    });
  }

  private step(direction: 1 | -1): void {
    const next = this.config.step(this.ctx.uiState.activeDate, direction);
    const ymd = parseDayKey(next);
    if (ymd) this.ctx.uiState.setVisibleMonth({ y: ymd.y, m: ymd.m });
    this.ctx.uiState.setActiveDate(next);
  }
}
