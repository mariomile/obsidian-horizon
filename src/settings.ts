import type { CalendarMode, Period, PeriodConfig } from './types.ts';

export interface AgentExportSettings {
  enabled: boolean;
  path: string;
}

export interface HorizonSettings {
  periods: Record<Period, PeriodConfig>;
  agentExport: AgentExportSettings;
  proposalsPath: string;
  agendaHorizonDays: number;
  previewCharacters: number;
  richCards: boolean;
  showWeekNumbers: boolean;
  showDue: boolean;
  showScheduled: boolean;
  showDone: boolean;
  showNotes: boolean;
  confirmBeforeCreate: boolean;
  daybar: boolean;
  lastMode: CalendarMode;
}

export const DEFAULT_SETTINGS: HorizonSettings = {
  periods: {
    daily: {
      enabled: true,
      folder: '',
      format: 'YYYY-MM-DD',
      template: '',
    },
    weekly: {
      enabled: false,
      folder: '',
      format: 'GGGG-[W]WW',
      template: '',
    },
    monthly: {
      enabled: false,
      folder: '',
      format: 'YYYY-MM',
      template: '',
    },
    yearly: {
      enabled: false,
      folder: '',
      format: 'YYYY',
      template: '',
    },
  },
  agentExport: {
    enabled: false,
    path: '.horizon/agenda.json',
  },
  proposalsPath: '.horizon/proposals.json',
  agendaHorizonDays: 14,
  previewCharacters: 220,
  richCards: true,
  showWeekNumbers: true,
  showDue: true,
  showScheduled: true,
  showDone: true,
  showNotes: true,
  confirmBeforeCreate: true,
  daybar: true,
  lastMode: 'month',
};

export const PERIODS: Period[] = ['daily', 'weekly', 'monthly', 'yearly'];

const MODES: CalendarMode[] = ['month', 'week', 'agenda', 'journal'];

export function parseSettings(data: unknown): HorizonSettings {
  if (!isRecord(data)) return structuredClone(DEFAULT_SETTINGS);
  const periods = isRecord(data.periods) ? data.periods : {};
  return {
    periods: {
      daily: parsePeriod(periods.daily, DEFAULT_SETTINGS.periods.daily),
      weekly: parsePeriod(periods.weekly, DEFAULT_SETTINGS.periods.weekly),
      monthly: parsePeriod(periods.monthly, DEFAULT_SETTINGS.periods.monthly),
      yearly: parsePeriod(periods.yearly, DEFAULT_SETTINGS.periods.yearly),
    },
    agentExport: parseAgentExport(data.agentExport),
    proposalsPath: stringValue(data.proposalsPath, DEFAULT_SETTINGS.proposalsPath),
    agendaHorizonDays: numberValue(data.agendaHorizonDays, DEFAULT_SETTINGS.agendaHorizonDays),
    previewCharacters: numberValue(data.previewCharacters, DEFAULT_SETTINGS.previewCharacters),
    richCards: booleanValue(data.richCards, DEFAULT_SETTINGS.richCards),
    showWeekNumbers: booleanValue(data.showWeekNumbers, DEFAULT_SETTINGS.showWeekNumbers),
    showDue: booleanValue(data.showDue, DEFAULT_SETTINGS.showDue),
    showScheduled: booleanValue(data.showScheduled, DEFAULT_SETTINGS.showScheduled),
    showDone: booleanValue(data.showDone, DEFAULT_SETTINGS.showDone),
    showNotes: booleanValue(data.showNotes, DEFAULT_SETTINGS.showNotes),
    confirmBeforeCreate: booleanValue(
      data.confirmBeforeCreate,
      DEFAULT_SETTINGS.confirmBeforeCreate,
    ),
    daybar: booleanValue(data.daybar, DEFAULT_SETTINGS.daybar),
    lastMode: modeValue(data.lastMode, DEFAULT_SETTINGS.lastMode),
  };
}

function parseAgentExport(value: unknown): AgentExportSettings {
  if (!isRecord(value)) return { ...DEFAULT_SETTINGS.agentExport };
  return {
    enabled: booleanValue(value.enabled, DEFAULT_SETTINGS.agentExport.enabled),
    path: stringValue(value.path, DEFAULT_SETTINGS.agentExport.path),
  };
}

function parsePeriod(value: unknown, fallback: PeriodConfig): PeriodConfig {
  if (!isRecord(value)) return { ...fallback };
  return {
    enabled: booleanValue(value.enabled, fallback.enabled),
    folder: stringValue(value.folder, fallback.folder),
    format: stringValue(value.format, fallback.format),
    template: stringValue(value.template, fallback.template),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function modeValue(value: unknown, fallback: CalendarMode): CalendarMode {
  return typeof value === 'string' && (MODES as string[]).includes(value)
    ? (value as CalendarMode)
    : fallback;
}
