import type { DayBucket, DayKey, NoteEntry, TaskEntry } from '../types.ts';

export interface FileContribution {
  tasks: TaskEntry[];
  note: (NoteEntry & { date: DayKey }) | null;
}

function emptyBucket(): DayBucket {
  return { due: [], scheduled: [], done: [], notes: [] };
}

function byPathAndLine(a: TaskEntry, b: TaskEntry): number {
  return a.path === b.path ? a.line - b.line : a.path < b.path ? -1 : 1;
}

function byTitle(a: NoteEntry, b: NoteEntry): number {
  return a.title === b.title ? (a.path < b.path ? -1 : 1) : a.title < b.title ? -1 : 1;
}

/**
 * Pure per-day index. Mutations are silent; callers decide when to notify —
 * the service layer batches the initial scan and debounces vault events.
 */
export class DayIndexCore {
  private readonly perFile = new Map<string, FileContribution>();
  private byDay: Map<DayKey, DayBucket> | null = null;
  private readonly listeners = new Set<() => void>();

  setFile(path: string, contribution: FileContribution): void {
    if (contribution.tasks.length === 0 && contribution.note === null) {
      this.perFile.delete(path);
    } else {
      this.perFile.set(path, contribution);
    }
    this.byDay = null;
  }

  removeFile(path: string): void {
    if (this.perFile.delete(path)) this.byDay = null;
  }

  renameFile(oldPath: string, newPath: string): void {
    const contribution = this.perFile.get(oldPath);
    if (!contribution) return;
    this.perFile.delete(oldPath);
    this.perFile.set(newPath, {
      tasks: contribution.tasks.map((t) => ({ ...t, path: newPath })),
      note: contribution.note ? { ...contribution.note, path: newPath } : null,
    });
    this.byDay = null;
  }

  getBucket(key: DayKey): DayBucket | null {
    return this.buckets().get(key) ?? null;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(): void {
    for (const listener of this.listeners) listener();
  }

  private buckets(): Map<DayKey, DayBucket> {
    if (this.byDay) return this.byDay;
    const map = new Map<DayKey, DayBucket>();
    const bucketFor = (key: DayKey): DayBucket => {
      let bucket = map.get(key);
      if (!bucket) {
        bucket = emptyBucket();
        map.set(key, bucket);
      }
      return bucket;
    };
    for (const contribution of this.perFile.values()) {
      for (const task of contribution.tasks) {
        if (task.due) bucketFor(task.due).due.push(task);
        if (task.scheduled) bucketFor(task.scheduled).scheduled.push(task);
        if (task.doneDate) bucketFor(task.doneDate).done.push(task);
      }
      if (contribution.note) {
        bucketFor(contribution.note.date).notes.push({
          path: contribution.note.path,
          title: contribution.note.title,
        });
      }
    }
    for (const bucket of map.values()) {
      bucket.due.sort(byPathAndLine);
      bucket.scheduled.sort(byPathAndLine);
      bucket.done.sort(byPathAndLine);
      bucket.notes.sort(byTitle);
    }
    this.byDay = map;
    return map;
  }
}
