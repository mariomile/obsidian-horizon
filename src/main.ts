import { moment, Notice, Plugin } from 'obsidian';

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
      icon: 'calendar-days',
      factory: (controller, containerEl) => new HorizonBasesView(controller, containerEl, ctx),
      options: HorizonBasesView.getViewOptions,
    });

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
