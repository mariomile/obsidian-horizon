import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { App } from 'obsidian';

import { DayIndexService } from './indexer.ts';

interface FakeFile {
  path: string;
  extension: string;
  content: string;
  cache: {
    frontmatter?: { date?: string };
    listItems?: { task?: string; position: { start: { line: number } } }[];
  };
}

function file(path: string, date: string | null, content = ''): FakeFile {
  const lines = content.split('\n');
  const listItems = lines.flatMap((line, i) =>
    line.startsWith('- [') ? [{ task: line[3], position: { start: { line: i } } }] : [],
  );
  return {
    path,
    extension: 'md',
    content,
    cache: {
      ...(date ? { frontmatter: { date } } : {}),
      ...(listItems.length > 0 ? { listItems } : {}),
    },
  };
}

const FILES: FakeFile[] = [
  file('a.md', '2026-07-01'),
  file('b.md', '2026-07-02', '- [ ] local task 📅 2026-07-03'),
  file('c.md', null, '- [ ] other task 📅 2026-07-03'),
  file('d.md', '2026-07-02'),
];

const RUNWAY_TASK = {
  path: 'c.md',
  line: 0,
  rawText: '- [ ] runway task 📅 2026-07-03',
  description: 'runway task',
  statusChar: ' ',
  done: false,
  recurring: false,
  due: '2026-07-03',
};

function fakeApp() {
  const log = { getFileCache: 0, cachedRead: 0 };
  const plugins: Record<string, unknown> = {};
  const app = {
    plugins: { plugins },
    vault: {
      getMarkdownFiles: () => FILES,
      cachedRead: async (f: FakeFile) => {
        log.cachedRead += 1;
        return f.content;
      },
    },
    metadataCache: {
      getFileCache: (f: FakeFile) => {
        log.getFileCache += 1;
        return f.cache;
      },
    },
  };
  const enableRunway = () => {
    plugins.runway = {
      api: { isReady: () => true, allTasks: () => [RUNWAY_TASK], subscribe: () => () => {} },
    };
  };
  return { app: app as unknown as App, log, enableRunway };
}

/** The private entry point a Runway source change goes through. */
function configure(service: DayIndexService): Promise<void> {
  return (service as unknown as { configureTaskSource(): Promise<void> }).configureTaskSource();
}

function snapshot(service: DayIndexService) {
  const days = ['2026-07-01', '2026-07-02', '2026-07-03'];
  return days.map((day) => {
    const bucket = service.getBucket(day);
    return {
      day,
      notes: bucket?.notes.map((n) => n.path).sort() ?? [],
      due: bucket?.due.map((t) => t.description).sort() ?? [],
    };
  });
}

describe('DayIndexService initial scan', () => {
  it('drops a scan superseded during its yield and ends equal to a clean scan of the newer one', async () => {
    const { app, log, enableRunway } = fakeApp();
    const service = new DayIndexService(app, () => false);

    const scanA = configure(service);
    enableRunway();
    const scanB = configure(service);
    await Promise.all([scanA, scanB]);

    // Only scan B touched the metadata cache, and it read no file content.
    assert.equal(log.getFileCache, FILES.length);
    assert.equal(log.cachedRead, 0);

    const clean = fakeApp();
    clean.enableRunway();
    const reference = new DayIndexService(clean.app, () => false);
    await configure(reference);
    assert.deepEqual(snapshot(service), snapshot(reference));
    assert.deepEqual(snapshot(service)[2]?.due, ['runway task']);
  });

  it('fills the index in one synchronous pass after the yield', async () => {
    const { app, log } = fakeApp();
    const service = new DayIndexService(app, () => false);
    let microtaskRan = false;
    let interleaved = false;
    const getFileCache = app.metadataCache.getFileCache.bind(app.metadataCache);
    (app.metadataCache as { getFileCache: unknown }).getFileCache = (f: FakeFile) => {
      if (microtaskRan && notesAtFirstRead === null) interleaved = true;
      if (log.getFileCache === 0) queueMicrotask(() => { microtaskRan = true; });
      return getFileCache(f as never);
    };
    let notesAtFirstRead: string[] | null = null;
    const cachedRead = app.vault.cachedRead.bind(app.vault);
    (app.vault as { cachedRead: unknown }).cachedRead = (f: FakeFile) => {
      notesAtFirstRead ??= snapshot(service).flatMap((d) => d.notes);
      return cachedRead(f as never);
    };

    await configure(service);

    assert.equal(interleaved, false);
    // Every task-free note is in before the first await; b.md waits for its content.
    assert.deepEqual(notesAtFirstRead, ['a.md', 'd.md']);
    assert.deepEqual(snapshot(service)[2]?.due, ['local task', 'other task']);
  });
});
