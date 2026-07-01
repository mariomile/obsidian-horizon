/** Local calendar day in 'YYYY-MM-DD' form. Never derived from UTC. */
export type DayKey = string;

export type Period = 'daily' | 'weekly' | 'monthly' | 'yearly';

export type TaskDateKind = 'due' | 'scheduled' | 'done';

export interface TaskEntry {
  path: string;
  line: number;
  rawText: string;
  description: string;
  status: string;
  done: boolean;
  recurring: boolean;
  due?: DayKey;
  scheduled?: DayKey;
  doneDate?: DayKey;
  cancelledDate?: DayKey;
}

/** Payload carried by a dragged task chip; enough to find and guard the source line. */
export interface TaskRef {
  path: string;
  line: number;
  rawText: string;
  dateKind: TaskDateKind;
}

export interface NoteEntry {
  path: string;
  title: string;
}

export interface DayBucket {
  due: TaskEntry[];
  scheduled: TaskEntry[];
  done: TaskEntry[];
  /** Notes with a matching `date` frontmatter. Periodic notes are resolved at render, not stored. */
  notes: NoteEntry[];
}

export interface PeriodConfig {
  enabled: boolean;
  folder: string;
  format: string;
  template: string;
}

export type CalendarMode = 'month' | 'week' | 'agenda';
