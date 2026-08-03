import type { TFile } from 'obsidian';

import type { HorizonContext } from './context.ts';
import { renderChip } from './day-cell.ts';
import type { ChipSpec } from './day-cell.ts';

/**
 * Fetch a note's preview and populate an already-mounted excerpt element,
 * appending a cover thumbnail to `cardEl` when one resolves. Shared by
 * `renderNoteCard` (chip cards) and `PeriodPreviewPanel` (sidebar panels) so
 * the async excerpt/thumb/fade-in dance exists in exactly one place.
 */
export function populatePreviewBody(
  ctx: HorizonContext,
  cardEl: HTMLElement,
  excerptEl: HTMLElement,
  file: TFile,
  chars: number,
): void {
  void ctx.preview
    .getPreview(file, chars)
    .then((preview) => {
      if (!cardEl.isConnected) return;
      if (preview.excerpt) {
        excerptEl.setText(preview.excerpt);
        excerptEl.addClass('is-loaded');
      } else {
        excerptEl.addClass('horizon-card__excerpt--empty');
      }
      if (preview.imageUrl) {
        const thumb = cardEl.createDiv({ cls: 'horizon-card__thumb' });
        thumb.style.backgroundImage = `url("${preview.imageUrl}")`;
        cardEl.addClass('horizon-chip--card-image');
        // Next frame, so the browser paints the transparent thumb first —
        // otherwise the opacity transition has nothing to animate from.
        requestAnimationFrame(() => thumb.addClass('is-loaded'));
      }
    })
    .catch(() => {
      if (!cardEl.isConnected) return;
      excerptEl.addClass('horizon-card__excerpt--empty');
    });
}

/**
 * Rich mini-card for a note chip: title now, excerpt + cover hydrated async.
 * The root keeps the `horizon-chip` contract (dataset.path/kind/key), so every
 * delegated handler — open, hover, keyboard — works unchanged.
 */
export function renderNoteCard(
  ctx: HorizonContext,
  parent: HTMLElement,
  chip: ChipSpec,
): HTMLElement {
  const el = parent.createDiv({
    cls: `horizon-chip ${chip.cls} horizon-chip--card`,
  });
  el.dataset.path = chip.path;
  el.dataset.kind = chip.kind;
  el.dataset.key = chip.dayKey;
  el.tabIndex = 0;
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', chip.label);

  const body = el.createDiv({ cls: 'horizon-card__body' });
  body.createDiv({ cls: 'horizon-card__title', text: chip.label });
  const excerptEl = body.createDiv({ cls: 'horizon-card__excerpt' });

  const file = ctx.app.vault.getFileByPath(chip.path);
  if (file) {
    populatePreviewBody(ctx, el, excerptEl, file, ctx.settings.previewCharacters);
  } else {
    excerptEl.addClass('horizon-card__excerpt--empty');
  }
  return el;
}

/** Surface router: rich card for notes (when enabled), compact chip otherwise. */
export function renderChipOrCard(
  ctx: HorizonContext,
  parent: HTMLElement,
  chip: ChipSpec,
): HTMLElement {
  if (chip.kind === 'note' && ctx.settings.richCards) {
    return renderNoteCard(ctx, parent, chip);
  }
  return renderChip(parent, chip);
}
