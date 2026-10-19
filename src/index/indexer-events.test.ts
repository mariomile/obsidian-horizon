import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { App, Plugin } from 'obsidian';

import { DayIndexService } from './indexer.ts';

interface FakeFile {
  path: string;
  extension: string;
}

interface FakeCache {
  frontmatter?: { date?: string };
  listItems?: { task?: string; position: { start: { line: number } } }[];
}

type Handler = (...args: unknown[]) => void;

/** Manual debounce clock standing in for `window.setTimeout`. */
const timers = new Map<number, () => void>();
let nextTimer = 1;
(globalThis as unknown as { window: unknown }).window = {
  setTimeout: (fn: () => void) => {
    const id = nextTimer++;
    timers.set(id, fn);
    return id;
  },
  clearTimeout: (id: number) => timers.delete(id),
};

function flush(): void {
  const pending = [...timers.values()];
  timers.clear();
  for (const fn of pending) fn();
}

function md(path: string): FakeFile {
  return { path, extension: 'md' };
}

function cacheFor(date: string | null, content: string): FakeCache {
  const listItems = content.split('\n').flatMap((line, i) =>
    line.startsWith('- [') ? [{ task: line[3], position: { start: { line: i } } }] : [],
  );
  return {
    ...(date ? { frontmatter: { date } } : {}),
    ...(listItems.length > 0 ? { listItems } : {}),
  };
}

function harness(isPeriodicPath: (path: string) => boolean = () => false) {
  const vaultHandlers = new Map<string, Handler>();
  const metaHandlers = new Map<string, Handler>();
  const plugins: Record<string, unknown> = {};
  const app = {
    plugins: { plugins },
    vault: {
      getMarkdownFiles: (): FakeFile[] => [],
      cachedRead: () => Promise.resolve(''),
      on: (name: string, fn: Handler) => vaultHandlers.set(name, fn),
    },
    metadataCache: {
      getFileCache: () => null,
      on: (name: string, fn: Handler) => metaHandlers.set(name, fn),
    },
    workspace: { on: () => ({}), onLayoutReady: () => {} },
  };
  const plugin = { registerEvent: () => {}, register: () => {} };
  const service = new DayIndexService(app as unknown as App, isPeriodicPath);
  service.start(plugin as unknown as Plugin);

  const counts = { index: 0, content: [] as string[][] };
  service.subscribe(() => {
    counts.index += 1;
  });
  service.subscribeContent((paths) => counts.content.push([...paths].sort()));

  const edit = (path: string, date: string | null, content = ''): void => {
    metaHandlers.get('changed')?.(md(path), content, cacheFor(date, content));
  };
  const runway = (tasks: unknown[]): (() => void) => {
    let listener: () => void = () => {};
    plugins.runway = {
      api: {
        isReady: () => true,
        allTasks: () => tasks,
        subscribe: (fn: () => void) => {
          listener = fn;
          return () => {};
        },
      },
    };
    return () => listener();
  };
  return { service, counts, edit, runway, vault: vaultHandlers };
}

function runwayTask(path: string, description: string, due: string) {
  return {
    path,
    line: 0,
    rawText: `- [ ] ${description} 📅 ${due}`,
    description,
    statusChar: ' ',
    done: false,
    recurring: false,
    due,
  };
}

/** The private entry point a Runway source change goes through. */
function configure(service: DayIndexService): Promise<void> {
  return (service as unknown as { configureTaskSource(): Promise<void> }).configureTaskSource();
}

beforeEach(() => timers.clear());

describe('DayIndexService change notifications', () => {
  it('does not redraw the calendar for an edit to an unrelated note', () => {
    const { counts, edit } = harness();
    for (let i = 0; i < 50; i += 1) edit(`plain-${i}.md`, null, 'just prose');
    flush();
    assert.equal(counts.index, 0);
    assert.equal(counts.content.length, 1);
    assert.equal(counts.content[0]?.length, 50);
  });

  it('still delivers a periodic note body edit to content subscribers', () => {
    const { counts, edit } = harness((path) => path.startsWith('Weekly/'));
    // Frontmatter date on a periodic path is ignored, so the contribution is null.
    edit('Weekly/2026-W29.md', '2026-07-13', 'first draft');
    flush();
    edit('Weekly/2026-W29.md', '2026-07-13', 'second draft');
    flush();
    assert.equal(counts.index, 0);
    assert.deepEqual(counts.content, [['Weekly/2026-W29.md'], ['Weekly/2026-W29.md']]);
  });

  it('redraws for a dated note even when only its body changed', () => {
    const { service, counts, edit } = harness();
    edit('meeting.md', '2026-07-01', 'agenda');
    flush();
    edit('meeting.md', '2026-07-01', 'agenda, now with minutes');
    flush();
    assert.equal(counts.index, 2);
    assert.deepEqual(counts.content, []);
    assert.deepEqual(service.getBucket('2026-07-01')?.notes.map((n) => n.path), ['meeting.md']);
  });

  it('redraws when a note goes from contributing to empty, then stops', () => {
    const { service, counts, edit } = harness();
    edit('task.md', null, '- [ ] call back 📅 2026-07-03');
    flush();
    assert.equal(service.getBucket('2026-07-03')?.due.length, 1);
    edit('task.md', null, 'call back done, line removed');
    flush();
    assert.equal(counts.index, 2);
    assert.equal(service.getBucket('2026-07-03'), null);
    edit('task.md', null, 'still nothing dated');
    flush();
    assert.equal(counts.index, 2);
    assert.deepEqual(counts.content, [['task.md']]);
  });

  it('one index notify per flush, with content paths folded into it', () => {
    const { counts, edit } = harness();
    edit('plain.md', null, 'prose');
    edit('dated.md', '2026-07-02');
    flush();
    assert.equal(counts.index, 1);
    assert.deepEqual(counts.content, []);
  });

  it('keeps structural notifications for create, delete and rename', () => {
    const { service, counts, edit, vault } = harness();
    edit('dated.md', '2026-07-02');
    flush();
    vault.get('rename')?.(md('moved.md'), 'dated.md');
    flush();
    assert.equal(counts.index, 2);
    assert.deepEqual(service.getBucket('2026-07-02')?.notes.map((n) => n.path), ['moved.md']);
    vault.get('delete')?.(md('moved.md'));
    flush();
    assert.equal(counts.index, 3);
    assert.equal(service.getBucket('2026-07-02'), null);
    // An undated note's create, delete and rename still notify: daily-note
    // existence and other structure are read straight from the vault.
    vault.get('create')?.(md('Daily/2026-07-04.md'));
    flush();
    vault.get('rename')?.(md('b.md'), 'a.md');
    flush();
    vault.get('delete')?.(md('b.md'));
    flush();
    assert.equal(counts.index, 6);
    // Non-markdown vault events stay ignored.
    vault.get('create')?.({ path: 'image.png', extension: 'png' });
    flush();
    assert.equal(counts.index, 6);
  });

  it('with Runway, redraws for shared-task changes and skips unchanged syncs', async () => {
    const { service, counts, edit, runway } = harness();
    const tasks = [runwayTask('plain.md', 'shared task', '2026-07-03')];
    const fire = runway(tasks);
    await configure(service);
    assert.equal(counts.index, 1); // initial scan
    assert.deepEqual(service.getBucket('2026-07-03')?.due.map((t) => t.description), ['shared task']);

    fire(); // same tasks again
    flush();
    assert.equal(counts.index, 1);

    tasks.push(runwayTask('other.md', 'new shared task', '2026-07-03'));
    fire();
    flush();
    assert.equal(counts.index, 2);
    assert.equal(service.getBucket('2026-07-03')?.due.length, 2);

    // A body edit to a note carrying shared tasks still redraws, and keeps them.
    edit('plain.md', null, 'local scan ignored while Runway is the source');
    flush();
    assert.equal(counts.index, 3);
    assert.equal(service.getBucket('2026-07-03')?.due.length, 2);

    // A note with no shared tasks and no date is content-only.
    edit('unrelated.md', null, '- [ ] local task 📅 2026-07-03');
    flush();
    assert.equal(counts.index, 3);
    assert.deepEqual(counts.content, [['unrelated.md']]);

    tasks.length = 0;
    fire();
    flush();
    assert.equal(counts.index, 4);
    assert.equal(service.getBucket('2026-07-03'), null);
  });
});
