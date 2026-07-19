import type { App, CachedMetadata, Plugin, TAbstractFile, TFile } from 'obsidian';

import { buildAgendaExport } from './agenda-export.ts';
import type { AgendaExport, AgendaExportOptions } from './agenda-export.ts';
import { DayIndexCore } from './day-index.ts';
import type { FileContribution } from './day-index.ts';
import { normalizeFrontmatterDate } from './frontmatter-date.ts';
import { extractTasks } from './task-scanner.ts';
import type { TaskListItem } from './task-scanner.ts';
import type { DayBucket, DayKey, TaskEntry } from '../types.ts';

const SCAN_CHUNK = 32;
const EMIT_DEBOUNCE_MS = 300;
const SOURCE_CHECK_DEBOUNCE_MS = 250;

interface RunwayTaskDTO {
  path: string;
  line: number;
  rawText: string;
  description: string;
  statusChar: string;
  done: boolean;
  recurring: boolean;
  due?: DayKey;
  scheduled?: DayKey;
  doneDate?: DayKey;
  cancelledDate?: DayKey;
}

interface RunwayTaskSource {
  isReady(): boolean;
  allTasks(): RunwayTaskDTO[];
  subscribe(listener: () => void): () => void;
}

function isMarkdownFile(file: TAbstractFile): file is TFile {
  return 'extension' in file && (file as TFile).extension === 'md';
}

function noteTitle(path: string): string {
  const slash = path.lastIndexOf('/');
  return path.slice(slash + 1).replace(/\.md$/, '');
}

function cacheTaskItems(cache: CachedMetadata): TaskListItem[] {
  const items = cache.listItems ?? [];
  const result: TaskListItem[] = [];
  for (const item of items) {
    if (item.task !== undefined) result.push({ line: item.position.start.line, task: item.task });
  }
  return result;
}

export function runwayTaskToEntry(task: RunwayTaskDTO): TaskEntry | null {
  if (!task.due && !task.scheduled && !task.doneDate && !task.cancelledDate) return null;
  return {
    path: task.path,
    line: task.line,
    rawText: task.rawText,
    description: task.description,
    status: task.statusChar,
    done: task.done,
    recurring: task.recurring,
    due: task.due,
    scheduled: task.scheduled,
    doneDate: task.doneDate,
    cancelledDate: task.cancelledDate,
  };
}

/**
 * Owns Horizon's day/note index. When Runway is active, its public task stream
 * is the canonical task source and Horizon only scans frontmatter dates. If
 * Runway is disabled at runtime, Horizon automatically falls back to its local
 * task scanner so the calendar remains self-contained.
 */
export class DayIndexService {
  private readonly app: App;
  private readonly isPeriodicPath: (path: string) => boolean;
  private readonly core = new DayIndexCore();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private sourceCheckTimer: ReturnType<typeof setTimeout> | null = null;
  private runwaySource: RunwayTaskSource | null = null;
  private runwayUnsubscribe: (() => void) | null = null;
  private configured = false;
  private scanGeneration = 0;
  private readonly notes = new Map<string, FileContribution['note']>();
  private sharedTasks = new Map<string, TaskEntry[]>();

  constructor(
    app: App,
    isPeriodicPath: (path: string) => boolean,
  ) {
    this.app = app;
    this.isPeriodicPath = isPeriodicPath;
  }

  getBucket(key: DayKey): DayBucket | null {
    return this.core.getBucket(key);
  }

  openDueBefore(key: DayKey): TaskEntry[] {
    return this.core.openDueBefore(key);
  }

  buildExport(options: AgendaExportOptions): AgendaExport {
    return buildAgendaExport(this.core, options);
  }

  subscribe(listener: () => void): () => void {
    return this.core.subscribe(listener);
  }

  start(plugin: Plugin): void {
    plugin.registerEvent(
      this.app.metadataCache.on('changed', (file, data, cache) => {
        const note = this.noteFor(file.path, cache);
        this.setNote(file.path, note);
        const tasks = this.runwaySource
          ? (this.sharedTasks.get(file.path) ?? [])
          : this.tasksFor(file.path, data, cache);
        this.core.setFile(file.path, { tasks, note });
        this.queueNotify();
      }),
    );
    plugin.registerEvent(
      this.app.vault.on('delete', (file) => {
        if (!isMarkdownFile(file)) return;
        this.notes.delete(file.path);
        this.sharedTasks.delete(file.path);
        this.core.removeFile(file.path);
        this.queueNotify();
      }),
    );
    plugin.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        if (!isMarkdownFile(file)) return;
        const oldNote = this.notes.get(oldPath);
        this.notes.delete(oldPath);
        if (oldNote) this.notes.set(file.path, { ...oldNote, path: file.path });
        const oldTasks = this.sharedTasks.get(oldPath);
        this.sharedTasks.delete(oldPath);
        if (oldTasks) {
          this.sharedTasks.set(file.path, oldTasks.map((task) => ({ ...task, path: file.path })));
        }
        this.core.renameFile(oldPath, file.path);
        this.queueNotify();
      }),
    );
    plugin.registerEvent(
      this.app.vault.on('create', (file) => {
        if (isMarkdownFile(file)) this.queueNotify();
      }),
    );
    plugin.registerEvent(
      this.app.workspace.on('layout-change', () => this.queueSourceCheck()),
    );
    plugin.register(() => {
      if (this.timer !== null) clearTimeout(this.timer);
      if (this.sourceCheckTimer !== null) clearTimeout(this.sourceCheckTimer);
      this.runwayUnsubscribe?.();
      this.runwayUnsubscribe = null;
    });
    this.app.workspace.onLayoutReady(() => {
      void this.configureTaskSource();
    });
  }

  private tasksFor(path: string, content: string, cache: CachedMetadata): TaskEntry[] {
    const items = cacheTaskItems(cache);
    return items.length > 0 ? extractTasks(path, content, items) : [];
  }

  private noteFor(path: string, cache: CachedMetadata): FileContribution['note'] {
    const parsed = normalizeFrontmatterDate(cache.frontmatter?.date);
    return parsed !== null && !this.isPeriodicPath(path)
      ? { path, title: noteTitle(path), date: parsed.day, time: parsed.time ?? undefined }
      : null;
  }

  private setNote(path: string, note: FileContribution['note']): void {
    if (note) this.notes.set(path, note);
    else this.notes.delete(path);
  }

  private runwayApi(): RunwayTaskSource | null {
    const app = this.app as App & {
      plugins?: { plugins?: Record<string, { api?: Partial<RunwayTaskSource> }> };
    };
    const api = app.plugins?.plugins?.runway?.api;
    return api &&
      typeof api.isReady === 'function' &&
      typeof api.allTasks === 'function' &&
      typeof api.subscribe === 'function'
      ? api as RunwayTaskSource
      : null;
  }

  private queueSourceCheck(): void {
    if (this.sourceCheckTimer !== null) clearTimeout(this.sourceCheckTimer);
    this.sourceCheckTimer = setTimeout(() => {
      this.sourceCheckTimer = null;
      void this.configureTaskSource();
    }, SOURCE_CHECK_DEBOUNCE_MS);
  }

  private async configureTaskSource(): Promise<void> {
    const next = this.runwayApi();
    if (this.configured && next === this.runwaySource) return;
    this.configured = true;
    this.runwayUnsubscribe?.();
    this.runwayUnsubscribe = null;
    this.runwaySource = next;
    this.sharedTasks.clear();
    if (next) {
      this.runwayUnsubscribe = next.subscribe(() => this.syncRunwayTasks());
    }
    await this.initialScan(next !== null);
  }

  private async initialScan(useRunway: boolean): Promise<void> {
    const generation = ++this.scanGeneration;
    this.core.clear();
    this.notes.clear();
    const taskFiles: TFile[] = [];

    for (const file of this.app.vault.getMarkdownFiles()) {
      const cache = this.app.metadataCache.getFileCache(file);
      if (!cache) continue;
      const note = this.noteFor(file.path, cache);
      this.setNote(file.path, note);
      if (useRunway) {
        if (note) this.core.setFile(file.path, { tasks: [], note });
        continue;
      }
      const hasTasks = cache.listItems?.some((item) => item.task !== undefined) ?? false;
      if (hasTasks) taskFiles.push(file);
      else if (note) this.core.setFile(file.path, { tasks: [], note });
    }

    if (useRunway) {
      this.syncRunwayTasks(false);
    } else {
      for (let i = 0; i < taskFiles.length; i += SCAN_CHUNK) {
        const chunk = taskFiles.slice(i, i + SCAN_CHUNK);
        await Promise.all(
          chunk.map(async (file) => {
            const cache = this.app.metadataCache.getFileCache(file);
            if (!cache) return;
            const content = await this.app.vault.cachedRead(file);
            if (generation !== this.scanGeneration) return;
            this.core.setFile(file.path, {
              tasks: this.tasksFor(file.path, content, cache),
              note: this.notes.get(file.path) ?? null,
            });
          }),
        );
      }
    }
    if (generation === this.scanGeneration) this.core.notify();
  }

  private syncRunwayTasks(notify = true): void {
    const source = this.runwaySource;
    if (!source) return;
    const next = new Map<string, TaskEntry[]>();
    for (const task of source.allTasks()) {
      const entry = runwayTaskToEntry(task);
      if (!entry) continue;
      const tasks = next.get(entry.path) ?? [];
      tasks.push(entry);
      next.set(entry.path, tasks);
    }

    const affected = new Set([...this.sharedTasks.keys(), ...next.keys()]);
    this.sharedTasks = next;
    for (const path of affected) {
      this.core.setFile(path, {
        tasks: next.get(path) ?? [],
        note: this.notes.get(path) ?? null,
      });
    }
    if (notify) this.queueNotify();
  }

  private queueNotify(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.core.notify();
    }, EMIT_DEBOUNCE_MS);
  }
}
