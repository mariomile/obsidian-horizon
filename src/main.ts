import { moment, Plugin } from 'obsidian';

import { todayKey } from './dates.ts';
import { openPeriodicNote } from './edits/note-creator.ts';
import { DayIndexService } from './index/indexer.ts';
import { PeriodicService } from './index/periodic.ts';
import type { MomentLike } from './index/periodic.ts';
import { HorizonSettingTab } from './settings-tab.ts';
import { DEFAULT_SETTINGS, parseSettings } from './settings.ts';
import type { HorizonSettings } from './settings.ts';
import { UiState } from './state.ts';
import { CALENDAR_VIEW_TYPE, HorizonCalendarView } from './ui/calendar-view.ts';
import type { HorizonContext } from './ui/context.ts';
import { HorizonSidebarView, SIDEBAR_VIEW_TYPE } from './ui/sidebar-view.ts';

export default class HorizonPlugin extends Plugin {
  settings: HorizonSettings = structuredClone(DEFAULT_SETTINGS);
  momentLike!: MomentLike;
  periodic!: PeriodicService;
  dayIndex!: DayIndexService;
  uiState!: UiState;

  async onload(): Promise<void> {
    const data: unknown = await this.loadData();
    this.settings = parseSettings(data);
    if (data === null || data === undefined) {
      await this.seedFromDailyNotesConfig();
    }

    this.momentLike = moment as unknown as MomentLike;
    this.periodic = new PeriodicService(
      this.app,
      this.momentLike,
      (period) => this.settings.periods[period],
    );
    this.dayIndex = new DayIndexService(this.app, (path) => this.periodic.isPeriodicPath(path));
    this.uiState = new UiState(todayKey(), this.settings.lastMode);

    this.registerHoverLinkSource('horizon', {
      display: 'Horizon',
      defaultMod: true,
    });

    const ctx = this.context();
    this.registerView(SIDEBAR_VIEW_TYPE, (leaf) => new HorizonSidebarView(leaf, ctx));
    this.registerView(CALENDAR_VIEW_TYPE, (leaf) => new HorizonCalendarView(leaf, ctx));

    this.addRibbonIcon('calendar-days', 'Apri Horizon', () => {
      void this.activateCalendar();
    });
    this.addCommand({
      id: 'open-calendar',
      name: 'Apri il calendario',
      callback: () => {
        void this.activateCalendar();
      },
    });
    this.addCommand({
      id: 'open-sidebar',
      name: 'Apri il calendario in sidebar',
      callback: () => {
        void this.activateSidebar(true);
      },
    });
    this.addCommand({
      id: 'open-today-note',
      name: 'Apri la nota di oggi',
      callback: () => {
        void openPeriodicNote(ctx, 'daily', todayKey(), false);
      },
    });

    this.dayIndex.start(this);
    this.addSettingTab(new HorizonSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      void this.activateSidebar(false);
    });
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(SIDEBAR_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(CALENDAR_VIEW_TYPE);
  }

  private async activateCalendar(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(CALENDAR_VIEW_TYPE)[0];
    const leaf = existing ?? this.app.workspace.getLeaf('tab');
    await leaf.setViewState({ type: CALENDAR_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  context(): HorizonContext {
    return {
      app: this.app,
      moment: this.momentLike,
      settings: this.settings,
      periodic: this.periodic,
      dayIndex: this.dayIndex,
      uiState: this.uiState,
      saveSettings: () => this.saveSettings(),
    };
  }

  private async activateSidebar(reveal: boolean): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE)[0];
    if (existing) {
      if (reveal) await this.app.workspace.revealLeaf(existing);
      return;
    }
    const leaf = await this.app.workspace.ensureSideLeaf(SIDEBAR_VIEW_TYPE, 'right', {
      reveal,
      active: reveal,
    });
    if (!leaf) return;
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /**
   * First run only: mirror the core daily-notes config so the calendar agrees
   * with the vault even if that config changed since DEFAULT_SETTINGS was written.
   */
  private async seedFromDailyNotesConfig(): Promise<void> {
    try {
      const raw = await this.app.vault.adapter.read(
        `${this.app.vault.configDir}/daily-notes.json`,
      );
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) return;
      const config = parsed as Record<string, unknown>;
      const daily = this.settings.periods.daily;
      if (typeof config.folder === 'string' && config.folder !== '') daily.folder = config.folder;
      if (typeof config.format === 'string' && config.format !== '') daily.format = config.format;
      if (typeof config.template === 'string' && config.template !== '') {
        daily.template = config.template;
      }
    } catch {
      // No daily-notes.json (or unreadable): the hardcoded defaults stand.
    }
  }
}
