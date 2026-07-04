import type { HorizonContext } from './context.ts';
import { renderChip } from './day-cell.ts';
import type { ChipSpec } from './day-cell.ts';

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
    void ctx.preview.getPreview(file, ctx.settings.previewCharacters).then((preview) => {
      if (!el.isConnected) return;
      if (preview.excerpt) {
        excerptEl.setText(preview.excerpt);
        excerptEl.addClass('is-loaded');
      } else {
        excerptEl.addClass('horizon-card__excerpt--empty');
      }
      if (preview.imageUrl) {
        const thumb = el.createDiv({ cls: 'horizon-card__thumb' });
        thumb.style.backgroundImage = `url("${preview.imageUrl}")`;
        el.addClass('horizon-chip--card-image');
        // Next frame, so the browser paints the transparent thumb first —
        // otherwise the opacity transition has nothing to animate from.
        requestAnimationFrame(() => thumb.addClass('is-loaded'));
      }
    });
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
