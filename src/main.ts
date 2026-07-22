import { addIcon, moment, Notice, Plugin } from 'obsidian';

import { parseDayKey, todayKey } from './dates.ts';
import { openPeriodicNote } from './edits/note-creator.ts';
import { HorizonApi } from './api.ts';
import { addDays } from './dates.ts';
import { DayIndexService } from './index/indexer.ts';
import { ProposalsService } from './index/proposals-service.ts';
import { NotePreviewService } from './preview.ts';
import { PeriodicService } from './index/periodic.ts';
import type { MomentLike } from './index/periodic.ts';
import { HorizonSettingTab } from './settings-tab.ts';
import { DEFAULT_SETTINGS, parseSettings } from './settings.ts';
import type { HorizonSettings } from './settings.ts';
import { UiState } from './state.ts';
import { BASES_CALENDAR_VIEW_TYPE, HorizonBasesView } from './ui/bases-view.ts';
import { CALENDAR_VIEW_TYPE, HorizonCalendarView } from './ui/calendar-view.ts';
import type { HorizonContext } from './ui/context.ts';
import { HorizonSidebarView, SIDEBAR_VIEW_TYPE } from './ui/sidebar-view.ts';

// Huge Icons (hugeicons.com, free/MIT, Stroke Rounded, 24x24 grid) — addIcon()
// always wraps content in a fixed viewBox="0 0 100 100", so a 4.166667x scale
// (100/24) brings the 24-unit paths to fill it correctly.
addIcon(
  'hi-calendar',
  '<g transform="scale(4.166667)" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5">' +
    '<path d="M16 2v4M8 2v4m5-2h-2C7.229 4 5.343 4 4.172 5.172S3 8.229 3 12v2c0 3.771 0 5.657 1.172 6.828S7.229 22 11 22h2c3.771 0 5.657 0 6.828-1.172S21 17.771 21 14v-2c0-3.771 0-5.657-1.172-6.828S16.771 4 13 4M3 10h18"/>' +
    '<path d="M12.126 14H12m.125 4H12m-4.376-4H7.5m.125 4H7.5m9.125-4H16.5m-4.25 0a.25.25 0 1 1-.5 0a.25.25 0 0 1 .5 0m0 4a.25.25 0 1 1-.5 0a.25.25 0 0 1 .5 0m-4.5-4a.25.25 0 1 1-.5 0a.25.25 0 0 1 .5 0m0 4a.25.25 0 1 1-.5 0a.25.25 0 0 1 .5 0m9-4a.25.25 0 1 1-.5 0a.25.25 0 0 1 .5 0"/>' +
    '</g>',
);

export default class HorizonPlugin extends Plugin {
  settings: HorizonSettings = structuredClone(DEFAULT_SETTINGS);
  momentLike!: MomentLike;
  periodic!: PeriodicService;
  dayIndex!: DayIndexService;
  proposals!: ProposalsService;
  preview!: NotePreviewService;
  uiState!: UiState;
  api!: HorizonApi;
  private exportTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly basesViews = new Set<HorizonBasesView>();

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
    this.proposals = new ProposalsService(this.app, () => this.settings.proposalsPath);
    this.preview = new NotePreviewService(this.app);
    this.registerEvent(this.app.vault.on('modify', (file) => this.preview.invalidate(file.path)));
    this.registerEvent(this.app.vault.on('delete', (file) => this.preview.invalidate(file.path)));
    this.registerEvent(
      this.app.vault.on('rename', (_file, oldPath) => this.preview.invalidate(oldPath)),
    );
    const today = parseDayKey(todayKey()) ?? { y: 2026, m: 1, d: 1 };
    this.uiState = new UiState(todayKey(), this.settings.lastMode, { y: today.y, m: today.m });

    this.registerHoverLinkSource('horizon', {
      display: 'Horizon',
      defaultMod: true,
    });

    const ctx = this.context();
    this.registerView(SIDEBAR_VIEW_TYPE, (leaf) => new HorizonSidebarView(leaf, ctx));
    this.registerView(CALENDAR_VIEW_TYPE, (leaf) => new HorizonCalendarView(leaf, ctx));
    this.registerBasesView(BASES_CALENDAR_VIEW_TYPE, {
      name: 'Horizon',
      icon: 'hi-calendar',
      factory: (controller, containerEl) => {
        const view = new HorizonBasesView(controller, containerEl, ctx, () => {
          this.basesViews.delete(view);
        });
        this.basesViews.add(view);
        return view;
      },
      options: HorizonBasesView.getViewOptions,
    });

    this.addRibbonIcon('hi-calendar', 'Apri Horizon', () => {
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
    const modeLabels: Record<string, string> = {
      month: 'Vista mese',
      week: 'Vista settimana',
      agenda: 'Vista agenda',
      journal: 'Vista diario',
    };
    for (const mode of ['month', 'week', 'agenda', 'journal'] as const) {
      this.addCommand({
        id: `mode-${mode}`,
        name: modeLabels[mode] ?? mode,
        callback: () => {
          void this.withCalendarView((view) => view.setMode(mode));
        },
      });
    }
    this.addCommand({
      id: 'next-period',
      name: 'Periodo successivo',
      callback: () => {
        void this.withCalendarView((view) => view.stepActive(1));
      },
    });
    this.addCommand({
      id: 'prev-period',
      name: 'Periodo precedente',
      callback: () => {
        void this.withCalendarView((view) => view.stepActive(-1));
      },
    });
    this.addCommand({
      id: 'go-today',
      name: 'Vai a oggi',
      callback: () => {
        void this.withCalendarView((view) => view.goTodayActive());
      },
    });
    this.addCommand({
      id: 'open-today-note',
      name: 'Apri la nota di oggi',
      callback: () => {
        void openPeriodicNote(ctx, 'daily', todayKey(), false);
      },
    });
    this.addCommand({
      id: 'open-active-day-in-runway',
      name: 'Apri il giorno attivo in Runway',
      callback: () => {
        const runway = (
          this.app as unknown as {
            plugins: {
              plugins: Record<string, { api?: { openForDay?: (day: string) => Promise<void> } }>;
            };
          }
        ).plugins.plugins.runway;
        if (!runway?.api?.openForDay) {
          new Notice('Horizon: Runway non è attivo.');
          return;
        }
        void runway.api.openForDay(this.uiState.activeDate);
      },
    });

    this.dayIndex.start(this);
    this.proposals.start(this);
    this.api = new HorizonApi(ctx, () => this.writeAgendaExport());
    this.register(this.dayIndex.subscribe(() => this.queueAgendaExport()));
    this.register(() => {
      if (this.exportTimer !== null) clearTimeout(this.exportTimer);
    });
    this.addCommand({
      id: 'export-agenda',
      name: 'Esporta agenda per gli agenti adesso',
      callback: () => {
        void this.writeAgendaExport().then((path) => {
          new Notice(`Horizon: agenda esportata in ${path}.`);
        });
      },
    });
    this.addSettingTab(new HorizonSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      void this.activateSidebar(false);
    });
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(SIDEBAR_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(CALENDAR_VIEW_TYPE);
  }

  /** Run an action on the calendar tab view, opening it first when absent. */
  private async withCalendarView(action: (view: HorizonCalendarView) => void): Promise<void> {
    let view = this.calendarView();
    if (!view) {
      await this.activateCalendar();
      view = this.calendarView();
    }
    if (view) action(view);
  }

  private calendarView(): HorizonCalendarView | null {
    const leaf = this.app.workspace.getLeavesOfType(CALENDAR_VIEW_TYPE)[0];
    return leaf && leaf.view instanceof HorizonCalendarView ? leaf.view : null;
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
      proposals: this.proposals,
      preview: this.preview,
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
    this.refreshViews();
  }

  /**
   * Live-refresh every open Horizon surface so display toggles (e.g. week
   * numbers) take effect immediately instead of only on reopen.
   */
  private refreshViews(): void {
    for (const view of this.basesViews) view.refresh();
    for (const leaf of this.app.workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE)) {
      if (leaf.view instanceof HorizonSidebarView) leaf.view.refresh();
    }
    for (const leaf of this.app.workspace.getLeavesOfType(CALENDAR_VIEW_TYPE)) {
      if (leaf.view instanceof HorizonCalendarView) leaf.view.refresh();
    }
  }

  /** Sync-churn friendly: at most one export write per 5 minutes of activity. */
  private queueAgendaExport(): void {
    if (!this.settings.agentExport.enabled) return;
    if (this.exportTimer !== null) return;
    this.exportTimer = setTimeout(() => {
      this.exportTimer = null;
      void this.writeAgendaExport();
    }, 5 * 60 * 1000);
  }

  private async writeAgendaExport(): Promise<string> {
    const path = this.settings.agentExport.path;
    const today = todayKey();
    const data = this.dayIndex.buildExport({
      today,
      from: addDays(today, -7),
      to: addDays(today, this.settings.agendaHorizonDays),
      generatedAt: new Date().toISOString(),
    });
    const slash = path.lastIndexOf('/');
    if (slash > 0) {
      const folder = path.slice(0, slash);
      if (!(await this.app.vault.adapter.exists(folder))) {
        await this.app.vault.adapter.mkdir(folder);
      }
    }
    await this.app.vault.adapter.write(path, JSON.stringify(data, null, 2));
    return path;
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
