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
    if (item.task !== undefined) {
      result.push({ line: item.position.start.line, task: item.task });
    }
  }
  return result;
}

/**
 * Thin service: owns the DayIndexCore, keeps it in sync with the vault, and
 * exposes a debounced change signal both calendar views subscribe to.
 */
export class DayIndexService {
  private readonly app: App;
  private readonly isPeriodicPath: (path: string) => boolean;
  private readonly core = new DayIndexCore();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(app: App, isPeriodicPath: (path: string) => boolean) {
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
        this.core.setFile(file.path, this.contributionFor(file.path, data, cache));
        this.queueNotify();
      }),
    );
    plugin.registerEvent(
      this.app.vault.on('delete', (file) => {
        if (!isMarkdownFile(file)) return;
        this.core.removeFile(file.path);
        this.queueNotify();
      }),
    );
    plugin.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        if (!isMarkdownFile(file)) return;
        this.core.renameFile(oldPath, file.path);
        this.queueNotify();
      }),
    );
    // Periodic notes are resolved at render time, so their creation must still
    // wake the views even though nothing lands in the index.
    plugin.registerEvent(
      this.app.vault.on('create', (file) => {
        if (isMarkdownFile(file)) this.queueNotify();
      }),
    );
    plugin.register(() => {
      if (this.timer !== null) clearTimeout(this.timer);
    });
    this.app.workspace.onLayoutReady(() => {
      void this.initialScan();
    });
  }

  private contributionFor(path: string, content: string, cache: CachedMetadata): FileContribution {
    const items = cacheTaskItems(cache);
    const tasks = items.length > 0 ? extractTasks(path, content, items) : [];
    const parsed = normalizeFrontmatterDate(cache.frontmatter?.date);
    const note =
      parsed !== null && !this.isPeriodicPath(path)
        ? { path, title: noteTitle(path), date: parsed.day, time: parsed.time ?? undefined }
        : null;
    return { tasks, note };
  }

  private async initialScan(): Promise<void> {
    const taskFiles: TFile[] = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      const cache = this.app.metadataCache.getFileCache(file);
      if (!cache) continue;
      const hasTasks = cache.listItems?.some((item) => item.task !== undefined) ?? false;
      if (hasTasks) {
        taskFiles.push(file);
        continue;
      }
      const parsed = normalizeFrontmatterDate(cache.frontmatter?.date);
      if (parsed !== null && !this.isPeriodicPath(file.path)) {
        this.core.setFile(file.path, {
          tasks: [],
          note: {
            path: file.path,
            title: noteTitle(file.path),
            date: parsed.day,
            time: parsed.time ?? undefined,
          },
        });
      }
    }
    for (let i = 0; i < taskFiles.length; i += SCAN_CHUNK) {
      const chunk = taskFiles.slice(i, i + SCAN_CHUNK);
      await Promise.all(
        chunk.map(async (file) => {
          const cache = this.app.metadataCache.getFileCache(file);
          if (!cache) return;
          const content = await this.app.vault.cachedRead(file);
          this.core.setFile(file.path, this.contributionFor(file.path, content, cache));
        }),
      );
    }
    this.core.notify();
  }

  private queueNotify(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.core.notify();
    }, EMIT_DEBOUNCE_MS);
  }
}
