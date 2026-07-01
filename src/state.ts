import type { CalendarMode, DayKey } from './types.ts';

/**
 * Tiny UI-state store shared by the sidebar and the full calendar view:
 * the focused date and the active full-view mode.
 */
export class UiState {
  private readonly listeners = new Set<() => void>();
  private currentDate: DayKey;
  private currentMode: CalendarMode;

  constructor(activeDate: DayKey, mode: CalendarMode) {
    this.currentDate = activeDate;
    this.currentMode = mode;
  }

  get activeDate(): DayKey {
    return this.currentDate;
  }

  get mode(): CalendarMode {
    return this.currentMode;
  }

  setActiveDate(key: DayKey): void {
    if (this.currentDate === key) return;
    this.currentDate = key;
    this.emit();
  }

  setMode(mode: CalendarMode): void {
    if (this.currentMode === mode) return;
    this.currentMode = mode;
    this.emit();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
