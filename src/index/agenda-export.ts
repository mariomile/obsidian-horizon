import { addDays, compareDayKeys } from '../dates.ts';
import type { DayIndexCore } from './day-index.ts';
import type { DayKey, TaskEntry } from '../types.ts';

/** Task shape exposed to agents: display fields + the guarded-edit reference. */
export interface TaskExport {
  description: string;
  path: string;
  line: number;
  rawText: string;
  status: string;
  done: boolean;
  recurring: boolean;
  due?: DayKey;
  scheduled?: DayKey;
  doneDate?: DayKey;
}

export interface NoteExport {
  path: string;
  title: string;
  time?: string;
}

export interface DayExport {
  day: DayKey;
  due: TaskExport[];
  scheduled: TaskExport[];
  done: TaskExport[];
  notes: NoteExport[];
}

export interface AgendaExport {
  generatedAt: string;
  from: DayKey;
  to: DayKey;
  overdue: TaskExport[];
  days: DayExport[];
}

export interface AgendaExportOptions {
  today: DayKey;
  from: DayKey;
  to: DayKey;
  generatedAt: string;
}

function exportTask(task: TaskEntry): TaskExport {
  const out: TaskExport = {
    description: task.description,
    path: task.path,
    line: task.line,
    rawText: task.rawText,
    status: task.status,
    done: task.done,
    recurring: task.recurring,
  };
  if (task.due) out.due = task.due;
  if (task.scheduled) out.scheduled = task.scheduled;
  if (task.doneDate) out.doneDate = task.doneDate;
  return out;
}

/**
 * Pure serializer: the per-day index as agent-readable data. Agents get
 * Horizon's already-correct answer instead of re-parsing emoji syntax.
 */
export function buildAgendaExport(core: DayIndexCore, options: AgendaExportOptions): AgendaExport {
  const days: DayExport[] = [];
  for (let key = options.from; compareDayKeys(key, options.to) <= 0; key = addDays(key, 1)) {
    const bucket = core.getBucket(key);
    if (!bucket) continue;
    days.push({
      day: key,
      due: bucket.due.filter((t) => t.status !== '-').map(exportTask),
      scheduled: bucket.scheduled.filter((t) => t.status !== '-').map(exportTask),
      done: bucket.done.map(exportTask),
      notes: bucket.notes.map((n) => {
        const note: NoteExport = { path: n.path, title: n.title };
        if (n.time !== undefined) note.time = n.time;
        return note;
      }),
    });
  }
  return {
    generatedAt: options.generatedAt,
    from: options.from,
    to: options.to,
    overdue: core.openDueBefore(options.today).map(exportTask),
    days,
  };
}
