# Horizon Daybar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Craft-style date-stepper pill to the view-header of daily notes — arrows page day-by-day, the date label opens a calendar picker popover.

**Architecture:** One new orchestrating module (`src/ui/daybar.ts`) plus a pure-logic core (`src/ui/daybar-core.ts`) and a small picker popover (`src/ui/date-picker.ts`). Everything else recomposes existing Horizon internals: `openPeriodicNote`/`ensurePeriodicNote` (open/create), `PeriodicService` (existence + config), `dates.ts` (arithmetic + `monthGrid`), `basenameToDate` (filename → date). The pill mounts into each daily-note markdown view's `.view-actions` header area and is re-synced on every leaf/layout event, so it dies with the leaf (no overlay leak).

**Tech Stack:** TypeScript, Obsidian API, `moment` (via `MomentLike`), `node:test` + `node:assert/strict` (run with `node --experimental-strip-types`).

## Global Constraints

- Test runner: `npm test` → `node --experimental-strip-types --test "src/**/*.test.ts"`. Tests import `realMoment from 'moment'` cast to `MomentLike`; **never** import `moment` directly in source.
- Source files use `.ts` extension in imports (e.g. `import { addDays } from '../dates.ts'`).
- Pure logic goes in `daybar-core.ts` (no `obsidian` import) so it is unit-testable under `node:test`; DOM/IO wiring goes in `daybar.ts` / `date-picker.ts` and is manually verified.
- `DayKey` = `'YYYY-MM-DD'` local-calendar string. Never derive from UTC.
- Scope is **daily notes only** (`period = 'daily'`). No weekly/monthly/yearly.
- Plugin is `isDesktopOnly: false` — desktop-first; mobile degradation is non-blocking.
- Build deploys to the vault via `.obsidian-plugin-dir`; do not `cp` a stale `main.js`.
- Commit style: `feat:` / `test:` / `style:` prefix; end body with the Co-Authored-By trailer used in this repo.

---

### Task 1: Pure core — daily resolution, label, picker cells

**Files:**
- Create: `src/ui/daybar-core.ts`
- Test: `src/ui/daybar-core.test.ts`

**Interfaces:**
- Consumes: `basenameToDate` from `src/index/periodic.ts`; `addDays`, `dayKey`, `parseDayKey`, `monthGrid`, `compareDayKeys` from `src/dates.ts`; `DayKey` from `src/types.ts`; `MomentLike` from `src/index/periodic.ts`.
- Produces:
  - `resolveDailyKey(moment: MomentLike, folder: string, format: string, filePath: string): DayKey | null`
  - `formatDayLabel(moment: MomentLike, key: DayKey): string`
  - `PickerCell { key: DayKey; inMonth: boolean; isToday: boolean; isCurrent: boolean; hasNote: boolean }`
  - `buildPickerCells(anchor: DayKey, opts: { currentKey: DayKey; todayKey: DayKey; hasNote: (key: DayKey) => boolean }): PickerCell[]`

- [ ] **Step 1: Write the failing test**

```ts
// src/ui/daybar-core.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import realMoment from 'moment';

import type { MomentLike } from '../index/periodic.ts';
import { resolveDailyKey, formatDayLabel, buildPickerCells } from './daybar-core.ts';

const moment = realMoment as unknown as MomentLike;

describe('resolveDailyKey', () => {
  it('resolves a file in the daily folder with matching format', () => {
    assert.equal(
      resolveDailyKey(moment, 'Journal/Daily', 'DD-MM-YYYY', 'Journal/Daily/21-07-2026.md'),
      '2026-07-21',
    );
  });

  it('resolves with an empty (vault-root) folder', () => {
    assert.equal(resolveDailyKey(moment, '', 'YYYY-MM-DD', '2026-07-21.md'), '2026-07-21');
  });

  it('rejects a file in a different folder', () => {
    assert.equal(
      resolveDailyKey(moment, 'Journal/Daily', 'DD-MM-YYYY', 'Notes/21-07-2026.md'),
      null,
    );
  });

  it('rejects a non-matching basename', () => {
    assert.equal(
      resolveDailyKey(moment, 'Journal/Daily', 'DD-MM-YYYY', 'Journal/Daily/Groceries.md'),
      null,
    );
  });

  it('tolerates a trailing slash on the folder', () => {
    assert.equal(
      resolveDailyKey(moment, 'Journal/Daily/', 'DD-MM-YYYY', 'Journal/Daily/21-07-2026.md'),
      '2026-07-21',
    );
  });
});

describe('formatDayLabel', () => {
  it('formats a DayKey as "D MMM YYYY"', () => {
    assert.equal(formatDayLabel(moment, '2026-07-21'), '21 Jul 2026');
  });
});

describe('buildPickerCells', () => {
  it('returns 42 cells flagging month membership, today, current and notes', () => {
    const cells = buildPickerCells('2026-07-21', {
      currentKey: '2026-07-21',
      todayKey: '2026-07-23',
      hasNote: (k) => k === '2026-07-15' || k === '2026-07-21',
    });
    assert.equal(cells.length, 42);
    const jul21 = cells.find((c) => c.key === '2026-07-21');
    assert.ok(jul21);
    assert.equal(jul21?.isCurrent, true);
    assert.equal(jul21?.hasNote, true);
    assert.equal(jul21?.inMonth, true);
    const jul23 = cells.find((c) => c.key === '2026-07-23');
    assert.equal(jul23?.isToday, true);
    const jun29 = cells.find((c) => c.key === '2026-06-29');
    assert.equal(jun29?.inMonth, false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test src/ui/daybar-core.test.ts`
Expected: FAIL — `Cannot find module './daybar-core.ts'` / exports undefined.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/ui/daybar-core.ts
import { addDays, compareDayKeys, dayKey, monthGrid, parseDayKey } from '../dates.ts';
import { basenameToDate } from '../index/periodic.ts';
import type { MomentLike } from '../index/periodic.ts';
import type { DayKey } from '../types.ts';

const normalizeFolder = (folder: string): string => folder.replace(/\/+$/, '');

/** Resolve a file path to its daily DayKey, or null if it is not a daily note. */
export function resolveDailyKey(
  moment: MomentLike,
  folder: string,
  format: string,
  filePath: string,
): DayKey | null {
  if (!filePath.endsWith('.md')) return null;
  const slash = filePath.lastIndexOf('/');
  const fileFolder = slash === -1 ? '' : filePath.slice(0, slash);
  if (normalizeFolder(fileFolder) !== normalizeFolder(folder)) return null;
  const basename = filePath.slice(slash + 1, -3);
  return basenameToDate(moment, basename, format);
}

/** Human label for the pill, e.g. "21 Jul 2026". */
export function formatDayLabel(moment: MomentLike, key: DayKey): string {
  return moment(key, 'YYYY-MM-DD', true).format('D MMM YYYY');
}

export interface PickerCell {
  key: DayKey;
  inMonth: boolean;
  isToday: boolean;
  isCurrent: boolean;
  hasNote: boolean;
}

/** 42 cells for the month containing `anchor`, decorated for rendering. */
export function buildPickerCells(
  anchor: DayKey,
  opts: { currentKey: DayKey; todayKey: DayKey; hasNote: (key: DayKey) => boolean },
): PickerCell[] {
  const ymd = parseDayKey(anchor);
  if (!ymd) return [];
  const keys = monthGrid(ymd.y, ymd.m);
  return keys.map((key) => {
    const cell = parseDayKey(key);
    return {
      key,
      inMonth: cell?.m === ymd.m,
      isToday: compareDayKeys(key, opts.todayKey) === 0,
      isCurrent: compareDayKeys(key, opts.currentKey) === 0,
      hasNote: opts.hasNote(key),
    };
  });
}

// Re-export for convenience of callers stepping days.
export { addDays, dayKey };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test src/ui/daybar-core.test.ts`
Expected: PASS — all `resolveDailyKey`, `formatDayLabel`, `buildPickerCells` assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/ui/daybar-core.ts src/ui/daybar-core.test.ts
git commit -m "feat: daybar pure core (daily resolution, label, picker cells)"
```

---

### Task 2: Settings — `daybar` toggle

**Files:**
- Modify: `src/settings.ts` (interface `HorizonSettings`, `DEFAULT_SETTINGS`, `parseSettings`)
- Modify: `src/settings-tab.ts` (add a toggle under the "Vista" section)
- Test: `src/settings.test.ts` (extend)

**Interfaces:**
- Produces: `HorizonSettings.daybar: boolean` (default `true`), round-tripped by `parseSettings`.

- [ ] **Step 1: Write the failing test**

Append to `src/settings.test.ts`:

```ts
describe('daybar setting', () => {
  it('defaults to true', () => {
    assert.equal(DEFAULT_SETTINGS.daybar, true);
  });

  it('round-trips a stored false', () => {
    assert.equal(parseSettings({ daybar: false }).daybar, false);
  });

  it('falls back to true when absent', () => {
    assert.equal(parseSettings({}).daybar, true);
  });
});
```

(Ensure `DEFAULT_SETTINGS` and `parseSettings` are imported at the top of the test file — they already are for the existing suite.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test src/settings.test.ts`
Expected: FAIL — `DEFAULT_SETTINGS.daybar` is `undefined`, `parseSettings(...).daybar` is `undefined`.

- [ ] **Step 3: Write minimal implementation**

In `src/settings.ts`, add to the `HorizonSettings` interface (next to `confirmBeforeCreate`):

```ts
  confirmBeforeCreate: boolean;
  daybar: boolean;
  lastMode: CalendarMode;
```

Add to `DEFAULT_SETTINGS` (next to `confirmBeforeCreate: true,`):

```ts
  confirmBeforeCreate: true,
  daybar: true,
  lastMode: 'month',
```

Add to the returned object in `parseSettings` (next to the `confirmBeforeCreate` line):

```ts
    confirmBeforeCreate: booleanValue(
      data.confirmBeforeCreate,
      DEFAULT_SETTINGS.confirmBeforeCreate,
    ),
    daybar: booleanValue(data.daybar, DEFAULT_SETTINGS.daybar),
    lastMode: modeValue(data.lastMode, DEFAULT_SETTINGS.lastMode),
```

In `src/settings-tab.ts`, after the "Numeri di settimana" toggle block (around line 50-66), add:

```ts
    new Setting(containerEl)
      .setName('Barra data nelle note giornaliere')
      .setDesc('Mostra il selettore ‹ data › nell’intestazione delle note giornaliere.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.daybar).onChange(async (value) => {
          this.plugin.settings.daybar = value;
          await this.plugin.saveSettings();
        }),
      );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test src/settings.test.ts`
Expected: PASS — default, round-trip, and fallback assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/settings.ts src/settings-tab.ts src/settings.test.ts
git commit -m "feat: daybar on/off setting (default on)"
```

---

### Task 3: Date-picker popover

**Files:**
- Create: `src/ui/date-picker.ts`

**Interfaces:**
- Consumes: `buildPickerCells`, `formatDayLabel` from `./daybar-core.ts`; `addMonths`, `parseDayKey`, `todayKey`, `dayKey` from `../dates.ts`; `HorizonContext` from `./context.ts`.
- Produces: `showDatePicker(ctx: HorizonContext, anchor: HTMLElement, currentKey: DayKey, onPick: (key: DayKey) => void): void` — opens a popover anchored under `anchor`; calls `onPick` with the chosen DayKey and closes; closes on Esc / outside-click.

**Note:** No unit test — DOM/positioning is manually verified in Step 3. The cell-building logic it renders is already tested in Task 1.

- [ ] **Step 1: Implement the popover**

```ts
// src/ui/date-picker.ts
import { addMonths, dayKey, parseDayKey, todayKey } from '../dates.ts';
import type { DayKey } from '../types.ts';
import type { HorizonContext } from './context.ts';
import { buildPickerCells } from './daybar-core.ts';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export function showDatePicker(
  ctx: HorizonContext,
  anchor: HTMLElement,
  currentKey: DayKey,
  onPick: (key: DayKey) => void,
): void {
  const pop = document.body.createDiv({ cls: 'horizon-datepicker' });
  let month = currentKey; // any key inside the displayed month

  const close = (): void => {
    document.removeEventListener('mousedown', onOutside, true);
    document.removeEventListener('keydown', onKey, true);
    pop.remove();
  };
  const onOutside = (e: MouseEvent): void => {
    if (!pop.contains(e.target as Node) && !anchor.contains(e.target as Node)) close();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };

  const render = (): void => {
    pop.empty();
    const ymd = parseDayKey(month);
    if (!ymd) return;
    const header = pop.createDiv({ cls: 'horizon-dp-header' });
    header.createSpan({
      cls: 'horizon-dp-title',
      text: ctx.moment(month, 'YYYY-MM-DD', true).format('MMMM YYYY'),
    });
    const nav = header.createDiv({ cls: 'horizon-dp-nav' });
    nav.createEl('button', { cls: 'horizon-dp-btn', text: '‹' }).onclick = () => {
      month = addMonths(month, -1);
      render();
    };
    nav.createEl('button', { cls: 'horizon-dp-btn', text: '⊙' }).onclick = () => {
      month = todayKey();
      render();
    };
    nav.createEl('button', { cls: 'horizon-dp-btn', text: '›' }).onclick = () => {
      month = addMonths(month, 1);
      render();
    };

    const grid = pop.createDiv({ cls: 'horizon-dp-grid' });
    for (const wd of WEEKDAYS) grid.createSpan({ cls: 'horizon-dp-weekday', text: wd });

    const cells = buildPickerCells(month, {
      currentKey,
      todayKey: todayKey(),
      hasNote: (key) => ctx.periodic.noteFor('daily', key) !== null,
    });
    for (const cell of cells) {
      const day = parseDayKey(cell.key);
      const el = grid.createEl('button', {
        cls: 'horizon-dp-day',
        text: String(day?.d ?? ''),
      });
      el.toggleClass('is-out', !cell.inMonth);
      el.toggleClass('is-today', cell.isToday);
      el.toggleClass('is-current', cell.isCurrent);
      el.toggleClass('has-note', cell.hasNote);
      el.onclick = () => {
        onPick(cell.key);
        close();
      };
    }
  };

  render();

  // Anchor under the pill, right-aligned to it.
  const rect = anchor.getBoundingClientRect();
  pop.style.position = 'fixed';
  pop.style.top = `${rect.bottom + 4}px`;
  pop.style.left = `${Math.max(8, rect.right - pop.offsetWidth)}px`;

  document.addEventListener('mousedown', onOutside, true);
  document.addEventListener('keydown', onKey, true);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `date-picker.ts`. (Styling lands in Task 6; the popover is unstyled but functional.)

- [ ] **Step 3: Commit**

```bash
git add src/ui/date-picker.ts
git commit -m "feat: date-picker popover (month grid, today jump, note dots)"
```

---

### Task 4: The Daybar pill + mount manager

**Files:**
- Create: `src/ui/daybar.ts`

**Interfaces:**
- Consumes: `resolveDailyKey`, `formatDayLabel` from `./daybar-core.ts`; `addDays` from `../dates.ts`; `openPeriodicNote`, `ensurePeriodicNote` from `../edits/note-creator.ts`; `showDatePicker` from `./date-picker.ts`; `HorizonContext` from `./context.ts`; `MarkdownView`, `TFile` from `obsidian`.
- Produces:
  - `class DaybarManager { constructor(ctx: HorizonContext); syncAll(): void; destroy(): void }`
  - `syncAll()` iterates every open markdown leaf and mounts/removes the pill to match whether its file is a daily and the `daybar` setting is on.

**Note:** DOM/IO — manually verified in Steps 2-3. The decisions it makes (`resolveDailyKey`, label, step target) are all covered by Task 1's tests.

- [ ] **Step 1: Implement the pill + manager**

```ts
// src/ui/daybar.ts
import { MarkdownView, type TFile } from 'obsidian';

import { addDays } from '../dates.ts';
import { ensurePeriodicNote, openPeriodicNote } from '../edits/note-creator.ts';
import type { DayKey } from '../types.ts';
import type { HorizonContext } from './context.ts';
import { formatDayLabel, resolveDailyKey } from './daybar-core.ts';
import { showDatePicker } from './date-picker.ts';

const PILL_CLASS = 'horizon-daybar';

/** Build the pill element for a given daily `key`, wired to nav + picker. */
function buildPill(ctx: HorizonContext, key: DayKey): HTMLElement {
  const pill = createDiv({ cls: PILL_CLASS });
  let pending: DayKey | null = null;

  const render = (): void => {
    pill.empty();
    pill.toggleClass('is-pending', pending !== null);
    const shownKey = pending ?? key;

    const prev = pill.createEl('button', { cls: 'horizon-daybar-arrow', text: '‹' });
    prev.onclick = () => void step(-1);

    const label = pill.createEl('button', {
      cls: 'horizon-daybar-label',
      text: formatDayLabel(ctx.moment, shownKey),
    });
    label.onclick = () => {
      if (pending) {
        // Confirm: create the pending day and open it.
        void createAndOpen(pending);
        return;
      }
      showDatePicker(ctx, pill, key, (picked) => {
        void openPeriodicNote(ctx, 'daily', picked, false);
      });
    };

    if (pending) {
      const create = pill.createEl('button', { cls: 'horizon-daybar-create', text: '＋' });
      create.setAttribute('aria-label', 'Crea questa nota');
      create.onclick = () => void createAndOpen(pending as DayKey);
    }

    const next = pill.createEl('button', { cls: 'horizon-daybar-arrow', text: '›' });
    next.onclick = () => void step(1);
  };

  const step = async (dir: 1 | -1): Promise<void> => {
    const target = addDays(pending ?? key, dir);
    const exists = ctx.periodic.noteFor('daily', target) !== null;
    if (exists) {
      pending = null;
      await openPeriodicNote(ctx, 'daily', target, false); // instant nav; view re-syncs
      return;
    }
    // Empty day: park in pending state, create only on explicit click.
    pending = target;
    render();
  };

  const createAndOpen = async (target: DayKey): Promise<void> => {
    pending = null;
    const file = await ensurePeriodicNote(ctx, 'daily', target);
    if (file) {
      await ctx.app.workspace.getLeaf(false).openFile(file);
    }
  };

  render();
  return pill;
}

export class DaybarManager {
  private readonly ctx: HorizonContext;

  constructor(ctx: HorizonContext) {
    this.ctx = ctx;
  }

  /** Mount/remove the pill on every open markdown leaf to match current state. */
  syncAll(): void {
    for (const leaf of this.ctx.app.workspace.getLeavesOfType('markdown')) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) continue;
      this.syncView(view);
    }
  }

  private syncView(view: MarkdownView): void {
    const actions = view.containerEl.querySelector<HTMLElement>('.view-header .view-actions');
    if (!actions) return;
    // Idempotent: strip any existing pill, then re-add if this is a daily.
    actions.querySelectorAll(`.${PILL_CLASS}`).forEach((el) => el.remove());

    const file: TFile | null = view.file;
    if (!file || !this.ctx.settings.daybar) return;
    const daily = this.ctx.settings.periods.daily;
    const key = resolveDailyKey(this.ctx.moment, daily.folder, daily.format, file.path);
    if (!key) return;

    const pill = buildPill(this.ctx, key);
    actions.prepend(pill);
  }

  destroy(): void {
    for (const leaf of this.ctx.app.workspace.getLeavesOfType('markdown')) {
      const view = leaf.view;
      if (view instanceof MarkdownView) {
        view.containerEl
          .querySelectorAll(`.${PILL_CLASS}`)
          .forEach((el) => el.remove());
      }
    }
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (`createDiv` is an Obsidian global augmenting `Document`; it is already used across the repo.)

- [ ] **Step 3: Commit**

```bash
git add src/ui/daybar.ts
git commit -m "feat: daybar pill + per-leaf mount manager"
```

---

### Task 5: Wire the manager into the plugin lifecycle

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `DaybarManager` from `./ui/daybar.ts`.
- Produces: the pill is live — mounted on layout-ready and re-synced on `active-leaf-change`, `file-open`, and `layout-change`; refreshed when settings change; removed on unload.

- [ ] **Step 1: Import and instantiate**

In `src/main.ts`, add the import near the other `./ui/*` imports:

```ts
import { DaybarManager } from './ui/daybar.ts';
```

Add a field on the plugin class (next to `api!: HorizonApi;`):

```ts
  api!: HorizonApi;
  private daybar!: DaybarManager;
```

- [ ] **Step 2: Register events + initial sync**

In `onload()`, after `this.api = new HorizonApi(...)` (around line 170), add:

```ts
    this.daybar = new DaybarManager(ctx);
    const syncDaybar = (): void => this.daybar.syncAll();
    this.registerEvent(this.app.workspace.on('active-leaf-change', syncDaybar));
    this.registerEvent(this.app.workspace.on('file-open', syncDaybar));
    this.registerEvent(this.app.workspace.on('layout-change', syncDaybar));
```

In the existing `this.app.workspace.onLayoutReady(...)` callback (around line 186), add a sync so the pill appears on notes already open at startup:

```ts
    this.app.workspace.onLayoutReady(() => {
      void this.activateSidebar(false);
      this.daybar.syncAll();
    });
```

In `refreshViews()` (around line 254), add a daybar re-sync so toggling the setting takes effect live:

```ts
  private refreshViews(): void {
    this.daybar?.syncAll();
    for (const view of this.basesViews) view.refresh();
```

In `onunload()`, remove the pills:

```ts
  onunload(): void {
    this.daybar?.destroy();
    this.app.workspace.detachLeavesOfType(SIDEBAR_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(CALENDAR_VIEW_TYPE);
  }
```

- [ ] **Step 3: Typecheck + full test suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; all existing tests plus Task 1/Task 2 tests pass.

- [ ] **Step 4: Manual verification in Obsidian**

Run: `npm run build` (deploys to the vault via `.obsidian-plugin-dir`), then reload the plugin in Obsidian (`Ctrl/Cmd-P → Reload app` or toggle the plugin).

Verify:
1. Open a daily note → the `‹ 21 Jul 2026 ›` pill appears in the note's header (right side).
2. Click `‹` onto an **existing** earlier daily → navigates instantly; pill updates to the new date.
3. Click `›`/`‹` onto an **empty** day → pill dims and shows `＋`; click `＋` (or the dimmed date) → note is created from the template and opened; pressing the other arrow instead resets without creating.
4. Click the date label → calendar popover opens; days with a daily note show a dot; `⊙` jumps to the current month; clicking a day opens/creates it.
5. Open a non-daily note → no pill. Switch back → pill returns.
6. Settings → toggle "Barra data nelle note giornaliere" off → pill disappears live; on → returns.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts
git commit -m "feat: wire daybar into plugin lifecycle (events, layout-ready, unload)"
```

---

### Task 6: Styles

**Files:**
- Modify: `styles.css`

**Interfaces:** none (CSS only). Manually verified.

- [ ] **Step 1: Add styles**

Append to `styles.css`:

```css
/* Daybar — date-stepper pill in the daily-note header */
.horizon-daybar {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-right: 6px;
  padding: 2px;
  border-radius: var(--radius-m);
  background: var(--background-modifier-hover);
}
.horizon-daybar-arrow,
.horizon-daybar-label,
.horizon-daybar-create {
  background: transparent;
  border: none;
  box-shadow: none;
  cursor: pointer;
  color: var(--text-muted);
  padding: 2px 6px;
  border-radius: var(--radius-s);
  font-size: var(--font-ui-small);
}
.horizon-daybar-label {
  color: var(--text-normal);
  font-weight: var(--font-medium);
}
.horizon-daybar-arrow:hover,
.horizon-daybar-label:hover,
.horizon-daybar-create:hover {
  background: var(--background-modifier-hover);
  color: var(--text-normal);
}
.horizon-daybar.is-pending .horizon-daybar-label {
  color: var(--text-faint);
  font-style: italic;
}
.horizon-daybar-create {
  color: var(--interactive-accent);
  font-weight: var(--font-bold);
}

/* Date-picker popover */
.horizon-datepicker {
  z-index: var(--layer-menu);
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-m);
  box-shadow: var(--shadow-s);
  padding: 10px;
  width: 260px;
}
.horizon-dp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.horizon-dp-title { font-weight: var(--font-medium); }
.horizon-dp-nav { display: inline-flex; gap: 2px; }
.horizon-dp-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  padding: 2px 6px;
  border-radius: var(--radius-s);
}
.horizon-dp-btn:hover { background: var(--background-modifier-hover); }
.horizon-dp-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}
.horizon-dp-weekday {
  text-align: center;
  font-size: var(--font-ui-smaller);
  color: var(--text-faint);
  padding-bottom: 4px;
}
.horizon-dp-day {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  cursor: pointer;
  border-radius: var(--radius-s);
  color: var(--text-normal);
  font-size: var(--font-ui-small);
  position: relative;
}
.horizon-dp-day:hover { background: var(--background-modifier-hover); }
.horizon-dp-day.is-out { color: var(--text-faint); }
.horizon-dp-day.is-current { background: var(--background-modifier-hover); font-weight: var(--font-bold); }
.horizon-dp-day.is-today { box-shadow: inset 0 0 0 1px var(--interactive-accent); }
.horizon-dp-day.has-note::after {
  content: '';
  position: absolute;
  bottom: 3px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--interactive-accent);
}

/* Mobile: header is cramped — trim padding, hide the pill background */
.is-phone .horizon-daybar { background: transparent; margin-right: 2px; }
.is-phone .horizon-daybar-label { padding: 2px 4px; }
```

- [ ] **Step 2: Build + visual check**

Run: `npm run build`, reload the plugin, re-run the manual checks from Task 5 Step 4. Confirm the pill reads cleanly in both light and dark, and the popover matches the Craft reference (month header with `‹ ⊙ ›`, weekday row, note dots, today ring, current-day fill).

- [ ] **Step 3: Commit**

```bash
git add styles.css
git commit -m "style: daybar pill + date-picker popover"
```

---

## Self-Review

**Spec coverage:**
- §1 pill + arrows + label→popover → Tasks 4 (pill/arrows), 3 (popover), 6 (look). ✓
- §2 decisions: Horizon home ✓; view-header pill → Task 4 (`.view-actions` mount); step-1-day-create-on-explicit-click → Task 4 pending state; daily-only → Global Constraints + `resolveDailyKey`; today in popover → Task 3 `⊙`. ✓
- §3 architecture / reuse → Tasks 1–5 consume exactly the listed modules. ✓
- §4 interaction model (pending state) → Task 4 `step`/`createAndOpen`. ✓
- §5 placement + anti-duplicate guard → Task 4 `syncView` strips-then-adds (idempotent); mobile degradation → Task 6 `.is-phone`. ✓
- §6 files → daybar.ts, daybar-core.ts (+ date-picker.ts, flagged in spec as the "thin wrapper" fallback), main.ts, settings(+tab), styles.css. ✓
- §7 testing/risk → Tasks 1–2 TDD; DOM manual-verified (Task 5 Step 4). ✓
- §8 out of scope → no weekly/monthly/yearly, no standalone today button, no frontmatter/body changes. ✓

**Placeholder scan:** none — every code step carries full code; every run step names the command and expected result.

**Type consistency:** `DayKey` string throughout; `resolveDailyKey`/`formatDayLabel`/`buildPickerCells`/`PickerCell` names match between Tasks 1, 3, 4; `openPeriodicNote(ctx, 'daily', key, false)` and `ensurePeriodicNote(ctx, 'daily', key)` match `note-creator.ts`; `periodic.noteFor('daily', key)` matches `PeriodicService`; `DaybarManager.syncAll()/destroy()` names match between Tasks 4 and 5.

**Deviation from spec (deliberate):** the calendar popover is a dedicated lightweight `date-picker.ts` rather than reusing the heavy chip-based `MonthGrid`. The spec explicitly flagged this as the expected fallback ("thin popover wrapper hosts the grid") and it is more faithful to the Craft picker while staying DRY on `dates.monthGrid` + `buildPickerCells`.
