# Horizon Day/Week Preview Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Below the sidebar mini-calendar, add two persistent preview panels — one for the active day's daily note, one for the active week's weekly note — so both are visible and click-to-open/create without leaving the sidebar.

**Architecture:** One new pure module (`src/ui/period-preview-core.ts`, heading formatters) and one new DOM component (`src/ui/period-preview-panel.ts`, `PeriodPreviewPanel`), instantiated twice (daily/weekly) from `HorizonSidebarView`. A small extraction from `src/ui/note-card.ts` (`populatePreviewBody`) is shared by both the existing note chip-cards and the new panels, closing a latent unhandled-rejection gap as a side effect. No new data source: both panels read through the existing `PeriodicService` and `NotePreviewService`, and reuse `openPeriodicNote` for open-or-create.

**Tech Stack:** TypeScript, Obsidian API, `moment` (via `MomentLike`), `node:test` + `node:assert/strict` (run with `node --experimental-strip-types`).

## Global Constraints

- Test runner: `npm test` → `node --experimental-strip-types --test "src/**/*.test.ts"`. Tests import `realMoment from 'moment'` cast to `MomentLike`; **never** import `moment` directly in source.
- Source files use `.ts` extension in imports (e.g. `import { addDays } from '../dates.ts'`).
- Pure logic goes in `period-preview-core.ts` (no `obsidian` import) so it is unit-testable under `node:test`; DOM/IO wiring goes in `period-preview-panel.ts` and is manually verified.
- `DayKey` = `'YYYY-MM-DD'` local-calendar string. Never derive from UTC.
- All user-facing strings (labels, `aria-label`s, Notices) must be **English** — `src/i18n-contract.test.ts` fails the build on Italian function words in `setName`/`setDesc`/`setPlaceholder`/`setTooltip`/`Notice` arguments and in `name`/`title`/`description`/`label`/`text` object-literal properties.
- CSS additions must satisfy `src/style-contract.test.ts`: no raw `ms`/hex/`cubic-bezier` values outside a `var(--token, fallback)` expression; every new `:hover` selector gated behind `@media (hover: hover)`; **do not add any `!important`** — the repo is already at the frozen ceiling of 5.
- Plugin is `isDesktopOnly: false` — desktop-first; the sidebar already renders full-width on phone, no extra mobile work needed for this feature.
- Build deploys to the vault via `.obsidian-plugin-dir`; do not `cp` a stale `main.js`.
- Commit style: `feat:` / `test:` / `docs:` prefix; end body with the Co-Authored-By trailer used in this repo.

---

### Task 1: Pure core — day/week heading formatters

**Files:**
- Create: `src/ui/period-preview-core.ts`
- Test: `src/ui/period-preview-core.test.ts`

**Interfaces:**
- Consumes: `addDays`, `startOfWeekMonday`, `isoWeek` from `src/dates.ts`; `MomentLike` from `src/index/periodic.ts`; `DayKey` from `src/types.ts`.
- Produces:
  - `dailyHeading(moment: MomentLike, key: DayKey): string` — e.g. `"3 Aug"`.
  - `weeklyHeading(moment: MomentLike, key: DayKey): string` — e.g. `"W32 · 3 Aug – 9 Aug"`. Accepts any `DayKey` inside the week; always resolves to that week's Monday–Sunday span.

- [ ] **Step 1: Write the failing test**

```ts
// src/ui/period-preview-core.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import realMoment from 'moment';

import type { MomentLike } from '../index/periodic.ts';
import { dailyHeading, weeklyHeading } from './period-preview-core.ts';

const moment = realMoment as unknown as MomentLike;

describe('dailyHeading', () => {
  it('formats a DayKey as "D MMM"', () => {
    assert.equal(dailyHeading(moment, '2026-08-03'), '3 Aug');
  });
});

describe('weeklyHeading', () => {
  it('formats the ISO week spanning a Monday key', () => {
    // 2026-08-03 is a Monday — its own week's first day.
    assert.equal(weeklyHeading(moment, '2026-08-03'), 'W32 · 3 Aug – 9 Aug');
  });

  it('formats the ISO week spanning a mid-week key', () => {
    // 2026-07-28 is a Tuesday inside the W31 week (27 Jul – 2 Aug).
    assert.equal(weeklyHeading(moment, '2026-07-28'), 'W31 · 27 Jul – 2 Aug');
  });

  it('is stable for any day inside the same week', () => {
    assert.equal(weeklyHeading(moment, '2026-08-05'), weeklyHeading(moment, '2026-08-03'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test src/ui/period-preview-core.test.ts`
Expected: FAIL — `Cannot find module './period-preview-core.ts'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/ui/period-preview-core.ts
import { addDays, isoWeek, startOfWeekMonday } from '../dates.ts';
import type { MomentLike } from '../index/periodic.ts';
import type { DayKey } from '../types.ts';

/** Heading for the day panel, e.g. "3 Aug". */
export function dailyHeading(moment: MomentLike, key: DayKey): string {
  return moment(key, 'YYYY-MM-DD', true).format('D MMM');
}

/** Heading for the week panel, e.g. "W32 · 3 Aug – 9 Aug". Accepts any day inside the week. */
export function weeklyHeading(moment: MomentLike, key: DayKey): string {
  const monday = startOfWeekMonday(key);
  const sunday = addDays(monday, 6);
  const { week } = isoWeek(monday);
  const from = moment(monday, 'YYYY-MM-DD', true).format('D MMM');
  const to = moment(sunday, 'YYYY-MM-DD', true).format('D MMM');
  return `W${week} · ${from} – ${to}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test src/ui/period-preview-core.test.ts`
Expected: PASS — all `dailyHeading`/`weeklyHeading` assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/ui/period-preview-core.ts src/ui/period-preview-core.test.ts
git commit -m "feat: day/week heading formatters for the sidebar preview panels"
```

---

### Task 2: Settings — `notePreviewPanels` toggle

**Files:**
- Modify: `src/settings.ts` (interface `HorizonSettings`, `DEFAULT_SETTINGS`, `parseSettings`)
- Modify: `src/settings-tab.ts`
- Test: `src/settings.test.ts` (extend)

**Interfaces:**
- Produces: `HorizonSettings.notePreviewPanels: boolean` (default `true`), round-tripped by `parseSettings`. Covers both the day and week panel — one flag, not two.

- [ ] **Step 1: Write the failing test**

Append to `src/settings.test.ts`:

```ts
describe('notePreviewPanels setting', () => {
  it('defaults to true', () => {
    assert.equal(DEFAULT_SETTINGS.notePreviewPanels, true);
  });

  it('round-trips a stored false', () => {
    assert.equal(parseSettings({ notePreviewPanels: false }).notePreviewPanels, false);
  });

  it('falls back to true when absent', () => {
    assert.equal(parseSettings({}).notePreviewPanels, true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test src/settings.test.ts`
Expected: FAIL — `DEFAULT_SETTINGS.notePreviewPanels` is `undefined`, `parseSettings(...).notePreviewPanels` is `undefined`.

- [ ] **Step 3: Write minimal implementation**

In `src/settings.ts`, add to the `HorizonSettings` interface (next to `daybar: boolean;`):

```ts
  confirmBeforeCreate: boolean;
  daybar: boolean;
  notePreviewPanels: boolean;
  lastMode: CalendarMode;
```

Add to `DEFAULT_SETTINGS` (next to `daybar: true,`):

```ts
  confirmBeforeCreate: true,
  daybar: true,
  notePreviewPanels: true,
  lastMode: 'month',
```

Add to the returned object in `parseSettings` (next to the `daybar` line):

```ts
    daybar: booleanValue(data.daybar, DEFAULT_SETTINGS.daybar),
    notePreviewPanels: booleanValue(data.notePreviewPanels, DEFAULT_SETTINGS.notePreviewPanels),
    lastMode: modeValue(data.lastMode, DEFAULT_SETTINGS.lastMode),
```

In `src/settings-tab.ts`, right after the existing "Date bar in daily notes" toggle block (the one that reads `this.plugin.settings.daybar`), add:

```ts
    new Setting(containerEl)
      .setName('Note preview panels')
      .setDesc('Show a preview of the day and week notes under the sidebar mini-calendar.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.notePreviewPanels).onChange(async (value) => {
          this.plugin.settings.notePreviewPanels = value;
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
git commit -m "feat: note preview panels on/off setting (default on)"
```

---

### Task 3: Extract shared preview-populate helper from `note-card.ts`

**Files:**
- Modify: `src/ui/note-card.ts`

**Interfaces:**
- Consumes: existing `HorizonContext`, `NotePreviewService.getPreview` (unchanged).
- Produces: `populatePreviewBody(ctx: HorizonContext, cardEl: HTMLElement, excerptEl: HTMLElement, file: TFile, chars: number): void` — fetches the preview and fills `excerptEl` (text + `is-loaded`/`--empty` classes) and appends a `.horizon-card__thumb` to `cardEl` when a cover image resolves. Rejection-safe: a failed fetch falls back to the empty-excerpt state instead of an unhandled rejection.

**Note:** DOM/IO — no dedicated unit test (this repo's convention: pure logic is unit-tested, `Component`/DOM rendering is verified manually). Verified in Step 2 by confirming existing rich-card rendering (Week/Agenda views, `richCards` setting on) still works after the refactor.

- [ ] **Step 1: Extract the helper, keep `renderNoteCard` behavior-identical**

Replace the body of `src/ui/note-card.ts` with:

```ts
import type { TFile } from 'obsidian';

import type { HorizonContext } from './context.ts';
import { renderChip } from './day-cell.ts';
import type { ChipSpec } from './day-cell.ts';

/**
 * Fetch a note's preview and populate an already-mounted excerpt element,
 * appending a cover thumbnail to `cardEl` when one resolves. Shared by
 * `renderNoteCard` (chip cards) and `PeriodPreviewPanel` (sidebar panels) so
 * the async excerpt/thumb/fade-in dance exists in exactly one place.
 */
export function populatePreviewBody(
  ctx: HorizonContext,
  cardEl: HTMLElement,
  excerptEl: HTMLElement,
  file: TFile,
  chars: number,
): void {
  void ctx.preview
    .getPreview(file, chars)
    .then((preview) => {
      if (!cardEl.isConnected) return;
      if (preview.excerpt) {
        excerptEl.setText(preview.excerpt);
        excerptEl.addClass('is-loaded');
      } else {
        excerptEl.addClass('horizon-card__excerpt--empty');
      }
      if (preview.imageUrl) {
        const thumb = cardEl.createDiv({ cls: 'horizon-card__thumb' });
        thumb.style.backgroundImage = `url("${preview.imageUrl}")`;
        cardEl.addClass('horizon-chip--card-image');
        // Next frame, so the browser paints the transparent thumb first —
        // otherwise the opacity transition has nothing to animate from.
        requestAnimationFrame(() => thumb.addClass('is-loaded'));
      }
    })
    .catch(() => {
      if (!cardEl.isConnected) return;
      excerptEl.addClass('horizon-card__excerpt--empty');
    });
}

/**
 * Rich mini-card for a note chip: title now, excerpt + cover hydrated async.
 * The root keeps the `horizon-chip` contract (dataset.path/kind/key), so every
 * delegated handler — open, hover, keyboard — works unchanged.
 */
export function renderNoteCard(
  ctx: HorizonContext,
  parent: HTMLElement,
  chip: ChipSpec,
): HTMLElement {
  const el = parent.createDiv({
    cls: `horizon-chip ${chip.cls} horizon-chip--card`,
  });
  el.dataset.path = chip.path;
  el.dataset.kind = chip.kind;
  el.dataset.key = chip.dayKey;
  el.tabIndex = 0;
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', chip.label);

  const body = el.createDiv({ cls: 'horizon-card__body' });
  body.createDiv({ cls: 'horizon-card__title', text: chip.label });
  const excerptEl = body.createDiv({ cls: 'horizon-card__excerpt' });

  const file = ctx.app.vault.getFileByPath(chip.path);
  if (file) {
    populatePreviewBody(ctx, el, excerptEl, file, ctx.settings.previewCharacters);
  } else {
    excerptEl.addClass('horizon-card__excerpt--empty');
  }
  return el;
}

/** Surface router: rich card for notes (when enabled), compact chip otherwise. */
export function renderChipOrCard(
  ctx: HorizonContext,
  parent: HTMLElement,
  chip: ChipSpec,
): HTMLElement {
  if (chip.kind === 'note' && ctx.settings.richCards) {
    return renderNoteCard(ctx, parent, chip);
  }
  return renderChip(parent, chip);
}
```

- [ ] **Step 2: Typecheck + manual smoke check**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`, reload the plugin in Obsidian, open the Week or Agenda view with "Mini-cards with preview" on in settings. Confirm note cards still show title, excerpt, and cover thumbnail exactly as before.

- [ ] **Step 3: Commit**

```bash
git add src/ui/note-card.ts
git commit -m "refactor: extract populatePreviewBody from renderNoteCard"
```

---

### Task 4: `PeriodPreviewPanel` component

**Files:**
- Create: `src/ui/period-preview-panel.ts`

**Interfaces:**
- Consumes: `dailyHeading`, `weeklyHeading` from `./period-preview-core.ts`; `startOfWeekMonday` from `../dates.ts`; `populatePreviewBody` from `./note-card.ts`; `openPeriodicNote` from `../edits/note-creator.ts`; `makeButtonLike` from `./interactive.ts`; `HorizonContext` from `./context.ts`; `DayKey`, `Period` from `../types.ts`; `MomentLike` from `../index/periodic.ts`; `Component`, `Keymap` from `obsidian`.
- Produces:
  - `interface PeriodPreviewPanelConfig { period: Period; keyFor: (activeDate: DayKey) => DayKey; heading: (moment: MomentLike, key: DayKey) => string }`
  - `const DAILY_PANEL_CONFIG: PeriodPreviewPanelConfig`
  - `const WEEKLY_PANEL_CONFIG: PeriodPreviewPanelConfig`
  - `class PeriodPreviewPanel extends Component { constructor(ctx, containerEl, config); render(): void }`

**Note:** DOM/IO — manually verified in Task 5 Step 4. The heading logic it calls is already tested in Task 1.

- [ ] **Step 1: Implement the panel**

```ts
// src/ui/period-preview-panel.ts
import { Component, Keymap } from 'obsidian';

import { startOfWeekMonday } from '../dates.ts';
import { openPeriodicNote } from '../edits/note-creator.ts';
import type { MomentLike } from '../index/periodic.ts';
import type { DayKey, Period } from '../types.ts';
import type { HorizonContext } from './context.ts';
import { makeButtonLike } from './interactive.ts';
import { populatePreviewBody } from './note-card.ts';
import { dailyHeading, weeklyHeading } from './period-preview-core.ts';

export interface PeriodPreviewPanelConfig {
  period: Period;
  keyFor: (activeDate: DayKey) => DayKey;
  heading: (moment: MomentLike, key: DayKey) => string;
}

export const DAILY_PANEL_CONFIG: PeriodPreviewPanelConfig = {
  period: 'daily',
  keyFor: (activeDate) => activeDate,
  heading: dailyHeading,
};

export const WEEKLY_PANEL_CONFIG: PeriodPreviewPanelConfig = {
  period: 'weekly',
  keyFor: startOfWeekMonday,
  heading: weeklyHeading,
};

/**
 * Persistent preview of the daily/weekly note for the active date, mounted
 * below the sidebar mini-calendar. Two instances (daily, weekly) share this
 * one implementation, parameterized by `PeriodPreviewPanelConfig`.
 */
export class PeriodPreviewPanel extends Component {
  private readonly ctx: HorizonContext;
  private readonly containerEl: HTMLElement;
  private readonly config: PeriodPreviewPanelConfig;

  constructor(ctx: HorizonContext, containerEl: HTMLElement, config: PeriodPreviewPanelConfig) {
    super();
    this.ctx = ctx;
    this.containerEl = containerEl;
    this.config = config;
  }

  onload(): void {
    this.containerEl.addClass('horizon-period-panel');
    this.register(this.ctx.uiState.subscribe(() => this.render()));
    this.register(this.ctx.dayIndex.subscribe(() => this.render()));
    this.register(() => {
      this.containerEl.empty();
      this.containerEl.removeClass('horizon-period-panel');
    });
    this.render();
  }

  render(): void {
    const el = this.containerEl;
    el.empty();
    const { period, keyFor, heading } = this.config;

    if (!this.ctx.settings.notePreviewPanels || !this.ctx.settings.periods[period].enabled) {
      el.hide();
      return;
    }
    el.show();

    const key = keyFor(this.ctx.uiState.activeDate);
    el.createDiv({ cls: 'horizon-period-panel__heading', text: heading(this.ctx.moment, key) });

    const openThis = (event: MouseEvent): void => {
      void openPeriodicNote(this.ctx, period, key, Keymap.isModEvent(event));
    };

    const note = this.ctx.periodic.noteFor(period, key);
    if (note) {
      const card = el.createDiv({ cls: 'horizon-chip horizon-chip--card' });
      makeButtonLike(card, `Open ${note.basename}`);
      card.addEventListener('click', openThis);
      const body = card.createDiv({ cls: 'horizon-card__body' });
      body.createDiv({ cls: 'horizon-card__title', text: note.basename });
      const excerptEl = body.createDiv({ cls: 'horizon-card__excerpt' });
      populatePreviewBody(this.ctx, card, excerptEl, note, this.ctx.settings.previewCharacters);
    } else {
      const empty = el.createDiv({ cls: 'horizon-period-panel__empty' });
      makeButtonLike(empty, `Create note for ${heading(this.ctx.moment, key)}`);
      empty.addEventListener('click', openThis);
      empty.createSpan({ cls: 'horizon-period-panel__empty-label', text: 'No note yet' });
      empty.createSpan({ cls: 'horizon-period-panel__empty-hint', text: 'Click to create' });
    }
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (`el.hide()`/`el.show()` are Obsidian's `HTMLElement` augmentations, already used elsewhere via `obsidian.d.ts`.)

- [ ] **Step 3: Commit**

```bash
git add src/ui/period-preview-panel.ts
git commit -m "feat: PeriodPreviewPanel component (daily + weekly preview, empty-state create)"
```

---

### Task 5: Mount both panels in the sidebar

**Files:**
- Modify: `src/ui/sidebar-view.ts`

**Interfaces:**
- Consumes: `PeriodPreviewPanel`, `DAILY_PANEL_CONFIG`, `WEEKLY_PANEL_CONFIG` from `./period-preview-panel.ts`.
- Produces: `HorizonSidebarView` now mounts two additional children below the `MonthGrid`; `refresh()` re-renders them too (so the settings toggle takes effect live via the existing `refreshViews()` → `leaf.view.refresh()` path in `main.ts` — no `main.ts` change needed).

- [ ] **Step 1: Wire the two panels**

In `src/ui/sidebar-view.ts`, add the import:

```ts
import { DAILY_PANEL_CONFIG, PeriodPreviewPanel, WEEKLY_PANEL_CONFIG } from './period-preview-panel.ts';
```

Add two fields next to `private grid: MonthGrid | null = null;`:

```ts
  private grid: MonthGrid | null = null;
  private dayPanel: PeriodPreviewPanel | null = null;
  private weekPanel: PeriodPreviewPanel | null = null;
```

At the end of `onOpen()`, after the `this.grid = this.addChild(...)` block:

```ts
    this.dayPanel = this.addChild(
      new PeriodPreviewPanel(this.ctx, this.contentEl.createDiv(), DAILY_PANEL_CONFIG),
    );
    this.weekPanel = this.addChild(
      new PeriodPreviewPanel(this.ctx, this.contentEl.createDiv(), WEEKLY_PANEL_CONFIG),
    );
```

Update `refresh()`:

```ts
  /** Re-render on external changes (e.g. plugin settings toggled). */
  refresh(): void {
    this.grid?.render();
    this.dayPanel?.render();
    this.weekPanel?.render();
  }
```

Update `onClose()`:

```ts
  async onClose(): Promise<void> {
    if (this.grid) this.removeChild(this.grid);
    this.grid = null;
    if (this.dayPanel) this.removeChild(this.dayPanel);
    this.dayPanel = null;
    if (this.weekPanel) this.removeChild(this.weekPanel);
    this.weekPanel = null;
    this.contentEl.removeClass('horizon-sidebar');
  }
```

- [ ] **Step 2: Typecheck + full test suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; all existing tests plus Task 1/Task 2 tests pass.

- [ ] **Step 3: Manual verification in Obsidian**

Run: `npm run build` (deploys to the vault via `.obsidian-plugin-dir`), then reload the plugin (`Ctrl/Cmd-P → Reload app` or toggle the plugin).

Verify, with the Horizon sidebar open (right sidebar):
1. Below the mini-calendar, two sections appear: a day heading + card/empty-state, then a week heading + card/empty-state.
2. Click a day in the mini-calendar → both panels update: the day panel shows that day, the week panel shows the week containing it.
3. A day/week with an existing note shows title + excerpt (+ thumbnail if the note has a cover); clicking it opens the note.
4. A day/week with no note shows "No note yet" / "Click to create"; clicking it goes through the existing confirm-before-create flow (if `confirmBeforeCreate` is on) and then opens the newly created note.
5. Disable "Weekly notes" under Settings → Horizon → the week panel disappears live (no reload needed); re-enable → it returns.
6. Toggle "Note preview panels" off in Settings → both panels disappear live; toggle back on → both return, showing the currently active date/week.

- [ ] **Step 4: Commit**

```bash
git add src/ui/sidebar-view.ts
git commit -m "feat: mount day/week preview panels in the Horizon sidebar"
```

---

### Task 6: Styles

**Files:**
- Modify: `styles.css`

**Interfaces:** none (CSS only). Manually verified.

- [ ] **Step 1: Add styles**

Append to `styles.css`, after the "Note mini-cards" section:

```css
/* ============================== Period preview panels (sidebar) ============================== */

.horizon-period-panel {
  display: flex;
  flex-direction: column;
  gap: var(--size-2-2);
  padding: var(--size-4-1) var(--size-4-1) var(--size-4-2);
  border-top: var(--border-width) solid var(--background-modifier-border);
}

.horizon-period-panel__heading {
  font-size: var(--font-ui-smaller);
  font-weight: var(--font-medium);
  color: var(--text-muted);
}

.horizon-period-panel__empty {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--size-2-2);
  padding: var(--size-2-3);
  border-radius: var(--radius-m);
  border: 1px dashed var(--background-modifier-border);
  cursor: pointer;
  color: var(--text-faint);
  font-size: var(--font-ui-small);
  transition: border-color var(--horizon-ease), color var(--horizon-ease);
}

@media (hover: hover) {
  .horizon-period-panel__empty:hover {
    border-color: var(--background-modifier-border-hover);
    color: var(--text-muted);
  }
}

.horizon-period-panel__empty-hint {
  font-size: var(--font-ui-smaller);
}
```

Note: the "has a note" state deliberately adds no new classes beyond the existing `.horizon-chip`/`.horizon-chip--card`/`.horizon-card__*` selectors (`styles.css` "Note mini-cards" section) — `.horizon-period-panel`'s `flex-direction: column` with the initial `align-items: stretch` already makes the card fill the panel's width, so it needs no panel-specific override.

- [ ] **Step 2: Build + visual check**

Run: `npm run build`, reload the plugin, re-run the manual checks from Task 5 Step 3. Confirm both panels read cleanly in light and dark, the empty-state's dashed border reads as clickable-but-empty (not an error state), and the note card matches the look of existing rich cards elsewhere (Week/Agenda views).

- [ ] **Step 3: Run the full test + style-contract suite**

Run: `npm test && npx tsc --noEmit`
Expected: all tests pass, including `style-contract.test.ts` (no raw ms/hex/cubic-bezier outside `var()`, every `:hover` gated, `!important` count still ≤ 5) and `i18n-contract.test.ts` (no Italian in the new strings).

- [ ] **Step 4: Commit**

```bash
git add styles.css
git commit -m "style: day/week preview panel + empty-state"
```

---

## Self-Review

**Spec coverage:**
- §1 what & why → Tasks 4–5 (panels mounted, always visible, click-to-open/create). ✓
- §2 decisions: active-date-driven day panel → Task 4 `DAILY_PANEL_CONFIG.keyFor`; day-then-week layout, no day-list → Task 5 mount order; week-of-active-date → Task 4 `WEEKLY_PANEL_CONFIG.keyFor = startOfWeekMonday`; lightweight excerpt → Task 4 reuses `.horizon-card__*`; empty-state click-to-create → Task 4 `render()`'s `else` branch; one generic component → Task 4 single `PeriodPreviewPanel` class. ✓
- §3 architecture / reuse → Tasks 1, 3, 4 consume exactly the listed modules; extraction note → Task 3. ✓
- §4 interaction model → Task 4 `render()`/`openThis`; disabled-period hide → Task 4's `!this.ctx.settings.periods[period].enabled` branch. ✓
- §5 UI placement → Task 5 mounts two `addChild()`s below `MonthGrid`, no new view type. ✓
- §6 files → `period-preview-panel.ts` (+ test), `note-card.ts` edit, `sidebar-view.ts` edit, `settings.ts`/`settings-tab.ts` edit, `styles.css` edit — all present as Tasks 1–6. ✓
- §7 testing/risk → Tasks 1–2 TDD; Task 3/4/5/6 DOM manually verified; i18n/style contracts checked in Task 6 Step 3. ✓
- §8 out of scope → no week-notes list, no full markdown render, no `showWeekNumbers` change, single settings flag for both panels (not two). ✓

**Placeholder scan:** none — every code step carries full code; every run step names the command and expected result.

**Type consistency:** `DayKey`/`Period`/`MomentLike` used consistently across Tasks 1, 4; `dailyHeading`/`weeklyHeading` signatures match between Task 1 (definition) and Task 4 (`PeriodPreviewPanelConfig.heading` usage); `populatePreviewBody(ctx, cardEl, excerptEl, file, chars)` signature matches between Task 3 (definition, also used by `renderNoteCard`) and Task 4 (panel usage); `ctx.settings.notePreviewPanels` name matches between Task 2 (definition) and Task 4 (read); `PeriodPreviewPanel`/`DAILY_PANEL_CONFIG`/`WEEKLY_PANEL_CONFIG` names match between Task 4 (export) and Task 5 (import); `HorizonSidebarView.refresh()` extension in Task 5 matches the existing method Task 5 modifies (verified against current `sidebar-view.ts`, not assumed).

**Fixed during self-review:**
- Task 1's weekly-heading test dates were computed against the real `dates.ts` ISO-week algorithm (cross-checked with `moment().isoWeek()`) rather than hand-guessed — 2026-08-03 is a Monday (W32, 3–9 Aug), not the tail of W31 as an earlier draft of the design spec's mockup mistakenly showed (corrected there in a follow-up commit before this plan was written).
- Task 3's `.catch()` had a defensive `excerptEl.hasClass('is-loaded')` guard against a `.then()`/`.catch()` race that cannot happen — a single promise settles exactly once. Removed as unjustified complexity.
