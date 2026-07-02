import type { CalendarMode, DayKey } from './types.ts';

/**
 * Tiny UI-state store shared by the sidebar and the full calendar view:
 * the focused date and the active full-view mode.
 */
export interface VisibleMonth {
  y: number;
  m: number;
}

export class UiState {
  private readonly listeners = new Set<() => void>();
  private currentDate: DayKey;
  private currentMode: CalendarMode;
  private currentMonth: VisibleMonth;

  constructor(activeDate: DayKey, mode: CalendarMode, visibleMonth: VisibleMonth) {
    this.currentDate = activeDate;
    this.currentMode = mode;
    this.currentMonth = visibleMonth;
  }

  get activeDate(): DayKey {
    return this.currentDate;
  }

  get mode(): CalendarMode {
    return this.currentMode;
  }

  /** The month both month surfaces (sidebar + tab) display; last navigation wins. */
  get visibleMonth(): VisibleMonth {
    return this.currentMonth;
  }

  setVisibleMonth(month: VisibleMonth): void {
    if (this.currentMonth.y === month.y && this.currentMonth.m === month.m) return;
    this.currentMonth = month;
    this.emit();
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
