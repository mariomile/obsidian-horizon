import { Component, MarkdownRenderer, type TFile } from 'obsidian';

import { todayKey } from '../dates.ts';
import {
  createJournalPreview,
  journalCountLabel,
  listJournalEntries,
  type JournalEntry,
} from '../journal.ts';
import type { DayKey } from '../types.ts';
import type { HorizonContext } from './context.ts';

const PAGE_SIZE = 15;
const PREVIEW_CHARACTERS = 1_200;

export interface JournalViewCallbacks {
  onOpen: (key: DayKey, event: MouseEvent) => void;
}

/** A text-first, read-only feed of existing daily notes. */
export class JournalView extends Component {
  private readonly ctx: HorizonContext;
  private readonly containerEl: HTMLElement;
  private readonly callbacks: JournalViewCallbacks;
  private entries: JournalEntry<TFile>[] = [];
  private visibleCount = 0;
  private loading = false;
  private scrollEl: HTMLElement | null = null;

  constructor(ctx: HorizonContext, containerEl: HTMLElement, callbacks: JournalViewCallbacks) {
    super();
    this.ctx = ctx;
    this.containerEl = containerEl;
    this.callbacks = callbacks;
  }

  onload(): void {
    this.containerEl.addClass('horizon-journal');
    this.scrollEl = this.containerEl.parentElement;
    this.scrollEl?.addEventListener('scroll', this.handleScroll);
    this.register(() => this.scrollEl?.removeEventListener('scroll', this.handleScroll));
    this.register(() => {
      this.containerEl.empty();
      this.containerEl.removeClass('horizon-journal');
    });
    this.reset();
  }

  title(): string {
    return 'Journal';
  }

  step(direction: 1 | -1): void {
    // The journal is navigated by continuous scrolling rather than calendar periods.
    void direction;
  }

  goToday(): void {
    this.scrollEl?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  showDate(key: DayKey): void {
    void key;
    this.goToday();
  }

  private reset(): void {
    this.entries = listJournalEntries(
      this.ctx.app.vault.getMarkdownFiles(),
      this.ctx.periodic.config('daily'),
      this.ctx.moment,
      todayKey(),
    );
    this.visibleCount = 0;
    this.containerEl.empty();
    if (this.entries.length === 0) {
      this.containerEl.createDiv({
        cls: 'horizon-view__empty',
        text: 'No daily note available up to today.',
      });
      return;
    }
    this.renderContext();
    this.loadMore();
  }

  private renderContext(): void {
    const context = this.containerEl.createDiv({ cls: 'horizon-journal__context' });
    const copy = context.createDiv({ cls: 'horizon-journal__context-copy' });
    copy.createSpan({ cls: 'horizon-journal__eyebrow', text: 'Daily notes' });
    copy.createDiv({
      cls: 'horizon-journal__description',
      text: 'Start from today and scroll back through your journal.',
    });
    context.createSpan({
      cls: 'horizon-journal__count',
      text: journalCountLabel(this.entries.length),
    });
  }

  private loadMore(): void {
    if (this.loading || this.visibleCount >= this.entries.length) return;
    this.loading = true;
    const next = this.entries.slice(this.visibleCount, this.visibleCount + PAGE_SIZE);
    for (const entry of next) this.addChild(new JournalCard(this.ctx, this.containerEl, entry, this.callbacks));
    this.visibleCount += next.length;
    this.loading = false;
    this.renderEndMarker();
  }

  private renderEndMarker(): void {
    this.containerEl.querySelector('.horizon-journal__end')?.remove();
    const remaining = this.entries.length - this.visibleCount;
    this.containerEl.createDiv({
      cls: 'horizon-journal__end',
      text: remaining > 0 ? `Scroll to load ${Math.min(PAGE_SIZE, remaining)} more daily notes` : 'End of daily notes.',
    });
  }

  private readonly handleScroll = (): void => {
    const el = this.scrollEl;
    if (!el || el.scrollTop + el.clientHeight < el.scrollHeight - 360) return;
    this.loadMore();
  };
}

class JournalCard extends Component {
  private readonly ctx: HorizonContext;
  private readonly parentEl: HTMLElement;
  private readonly entry: JournalEntry<TFile>;
  private readonly callbacks: JournalViewCallbacks;
  private bodyEl: HTMLElement | null = null;
  private source = '';
  private expanded = false;
  private renderer: Component | null = null;

  constructor(
    ctx: HorizonContext,
    parentEl: HTMLElement,
    entry: JournalEntry<TFile>,
    callbacks: JournalViewCallbacks,
  ) {
    super();
    this.ctx = ctx;
    this.parentEl = parentEl;
    this.entry = entry;
    this.callbacks = callbacks;
  }

  onload(): void {
    const card = this.parentEl.createDiv({ cls: 'horizon-journal__card' });
    const head = card.createDiv({ cls: 'horizon-journal__head' });
    head.createSpan({
      cls: 'horizon-journal__date',
      text: this.ctx.moment(this.entry.key, 'YYYY-MM-DD', true).format('dddd D MMMM YYYY'),
    });
    const open = head.createEl('button', { cls: 'horizon-journal__open', text: 'Open' });
    open.setAttribute('aria-label', `Open the daily note for ${this.entry.key}`);
    open.addEventListener('click', (event) => this.callbacks.onOpen(this.entry.key, event));

    this.bodyEl = card.createDiv({ cls: 'horizon-journal__content' });
    this.bodyEl.createSpan({ cls: 'horizon-journal__loading', text: 'Loading…' });
    const actions = card.createDiv({ cls: 'horizon-journal__actions' });
    const expand = actions.createEl('button', { cls: 'horizon-journal__expand', text: 'Expand' });
    expand.setAttribute('aria-expanded', 'false');
    expand.hidden = true;
    expand.addEventListener('click', () => {
      this.expanded = !this.expanded;
      expand.setText(this.expanded ? 'Collapse' : 'Expand');
      expand.setAttribute('aria-expanded', String(this.expanded));
      void this.renderContent();
    });

    void this.ctx.app.vault.cachedRead(this.entry.file).then((source) => {
      this.source = source;
      const preview = createJournalPreview(source, PREVIEW_CHARACTERS);
      expand.hidden = !preview.truncated;
      void this.renderContent();
    }).catch(() => {
      this.bodyEl?.empty();
      this.bodyEl?.createSpan({
        cls: 'horizon-journal__empty',
        text: 'Could not read this daily note.',
      });
    });
  }

  private async renderContent(): Promise<void> {
    const body = this.bodyEl;
    if (!body) return;
    if (this.renderer) this.removeChild(this.renderer);
    this.renderer = null;
    body.empty();
    const preview = this.expanded
      ? { markdown: createJournalPreview(this.source, Number.MAX_SAFE_INTEGER).markdown, truncated: false }
      : createJournalPreview(this.source, PREVIEW_CHARACTERS);
    if (preview.markdown === '') {
      body.createSpan({ cls: 'horizon-journal__empty', text: 'Nothing written.' });
      return;
    }
    this.renderer = this.addChild(new Component());
    await MarkdownRenderer.render(this.ctx.app, preview.markdown, body, this.entry.file.path, this.renderer);
    for (const checkbox of Array.from(body.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))) {
      checkbox.disabled = true;
    }
  }
}
