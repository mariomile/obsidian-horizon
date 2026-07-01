import { moment, Plugin } from 'obsidian';

import { todayKey } from './dates.ts';
import { DayIndexService } from './index/indexer.ts';
import { PeriodicService } from './index/periodic.ts';
import type { MomentLike } from './index/periodic.ts';
import { HorizonSettingTab } from './settings-tab.ts';
import { DEFAULT_SETTINGS, parseSettings } from './settings.ts';
import type { HorizonSettings } from './settings.ts';
import { UiState } from './state.ts';

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

    this.dayIndex.start(this);
    this.addSettingTab(new HorizonSettingTab(this.app, this));
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
