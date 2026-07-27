export function isActivationKey(key: string): boolean {
  return key === 'Enter' || key === ' ';
}

/**
 * Preserve Obsidian's theme-aware clickable-icon markup while giving it the
 * keyboard and semantic contract of a real button.
 */
export function makeButtonLike(element: HTMLElement, label: string): HTMLElement {
  element.tabIndex = 0;
  element.setAttribute('role', 'button');
  element.setAttribute('aria-label', label);
  element.addEventListener('keydown', (event) => {
    if (!isActivationKey(event.key)) return;
    event.preventDefault();
    element.click();
  });
  return element;
}
