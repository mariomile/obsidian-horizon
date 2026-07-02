import type { HorizonContext } from './context.ts';

const SHOW_DELAY_MS = 300;

/**
 * Rich hover preview for compact note chips (month grid): thumb + title +
 * excerpt in a floating card. Cards elsewhere already show this inline, so the
 * delegated handler targets `--note` chips that are NOT `--card`.
 */
export function attachHoverCard(ctx: HorizonContext, containerEl: HTMLElement): () => void {
  let showTimer: ReturnType<typeof setTimeout> | null = null;
  let cardEl: HTMLElement | null = null;

  const clearTimer = (): void => {
    if (showTimer !== null) clearTimeout(showTimer);
    showTimer = null;
  };

  const hide = (): void => {
    clearTimer();
    cardEl?.remove();
    cardEl = null;
  };

  const show = (chipEl: HTMLElement, path: string): void => {
    const file = ctx.app.vault.getFileByPath(path);
    if (!file) return;
    void ctx.preview.getPreview(file, ctx.settings.previewCharacters * 2).then((preview) => {
      if (!chipEl.isConnected) return;
      hide();
      cardEl = document.body.createDiv({ cls: 'horizon-hovercard' });
      if (preview.imageUrl) {
        const image = cardEl.createDiv({ cls: 'horizon-hovercard__image' });
        image.style.backgroundImage = `url("${preview.imageUrl}")`;
      }
      cardEl.createDiv({ cls: 'horizon-hovercard__title', text: file.basename });
      if (preview.excerpt) {
        cardEl.createDiv({ cls: 'horizon-hovercard__excerpt', text: preview.excerpt });
      }
      const rect = chipEl.getBoundingClientRect();
      const width = 280;
      cardEl.style.left = `${Math.min(rect.left, window.innerWidth - width - 12)}px`;
      const below = rect.bottom + 8;
      const height = cardEl.getBoundingClientRect().height || 220;
      cardEl.style.top =
        below + height < window.innerHeight ? `${below}px` : `${Math.max(8, rect.top - height - 8)}px`;
    });
  };

  const findChip = (target: EventTarget | null): HTMLElement | null => {
    if (!(target instanceof Element)) return null;
    const chipEl = target.closest<HTMLElement>('.horizon-chip--note');
    if (!chipEl || chipEl.classList.contains('horizon-chip--card')) return null;
    return chipEl.dataset.path ? chipEl : null;
  };

  const onMouseOver = (event: MouseEvent): void => {
    const chipEl = findChip(event.target);
    if (!chipEl) return;
    const related = event.relatedTarget;
    if (related instanceof Node && chipEl.contains(related)) return;
    clearTimer();
    showTimer = setTimeout(() => show(chipEl, chipEl.dataset.path ?? ''), SHOW_DELAY_MS);
  };

  const onMouseOut = (event: MouseEvent): void => {
    const chipEl = findChip(event.target);
    if (!chipEl) return;
    const related = event.relatedTarget;
    if (related instanceof Node && chipEl.contains(related)) return;
    hide();
  };

  const onScroll = (): void => hide();

  containerEl.addEventListener('mouseover', onMouseOver);
  containerEl.addEventListener('mouseout', onMouseOut);
  containerEl.addEventListener('click', hide, true);
  window.addEventListener('scroll', onScroll, true);
  return () => {
    containerEl.removeEventListener('mouseover', onMouseOver);
    containerEl.removeEventListener('mouseout', onMouseOut);
    containerEl.removeEventListener('click', hide, true);
    window.removeEventListener('scroll', onScroll, true);
    hide();
  };
}
