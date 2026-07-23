# Horizon Daybar — Design Spec

**Date:** 2026-07-23
**Status:** Approved (design) — pending implementation plan
**Repo:** obsidian-horizon
**Scope:** medium — 1 new UI module + wiring, ~80% recomposition of existing Horizon internals

---

## 1. What & why

A Craft-style **date-stepper pill** that appears in the view-header of a daily note:

```
‹ 21 Jul 2026 ›
```

- The **arrows** page to the previous/next day.
- Clicking the **date label** opens a **calendar popover** to jump to any date.

Today, moving between daily notes in Obsidian means: open the calendar tab, or use the sidebar mini-calendar, or fuzzy-search the filename. The daybar puts day-to-day navigation **inline on the note you're already reading** — the single most frequent journaling motion — without leaving the document.

**Example**
- Before: on `21-07-2026`, to reach yesterday you switch to the Horizon tab / sidebar, find the 20th, click it.
- After: on `21-07-2026`, click `‹` → land on the 20th. One click, eyes never leave the note.

---

## 2. Decisions (locked during brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Home plugin | **Horizon** | Already owns periodic-note resolution, note creation, calendar rendering |
| Render surface | **View-header pill** (option A) | Mode-independent (edit＝read), lifecycle-safe (dies with the leaf), does not touch the strict daily body format |
| Prev/next semantics | **Step 1 day, create only on explicit click** | Fast paging over existing notes; no empty-note spam |
| Scope | **Daily notes only** (`periods.daily`) | Craft-focused; weekly/periodic is a clean future extension |
| "Today" affordance | **Inside the popover** (⊙), not a third pill element | Keeps the pill to two arrows + label |

---

## 3. Architecture

One new orchestrating module, `src/ui/daybar.ts`. It composes existing Horizon internals; it introduces no new data source.

```
active-leaf-change / file-open
        │
        ▼
  isDailyNote(file)  ──►  { isDaily, dayKey }
        │
   ┌────┴──────────────────────────────────┐
   │ non-daily → unmount any existing daybar │
   │ daily     → mount Daybar(view, dayKey)  │
   └─────────────────────────────────────────┘

  Daybar(view, dayKey)
   ├─ label   = formatDayKey(dayKey)                    ← dates.ts
   ├─ ‹ / ›   = addDays(dayKey, ∓1) → targetKey         ← dates.ts
   ├─ label▸  = calendar popover (month-grid + dots)    ← ui/month-grid.ts (+ popover shell)
   └─ mount   → view.headerEl `.view-actions`           ← lifecycle-safe
```

### Reused modules (no rewrite)

| Module | Used for |
|---|---|
| `src/index/periodic.ts` — `PeriodicService`, `basenameToDate`, `dateToBasename`, `dateToPath` | Detect "is this file a daily?" and map date ↔ filename/path |
| `src/dates.ts` — `addDays`, `parseDayKey`, `todayKey`, `compareDayKeys`, `DayKey` | Step to adjacent day, format, today jump |
| `src/edits/note-creator.ts` — `ensurePeriodicNote`, `openPeriodicNote` | Open existing / create-from-template on explicit confirm |
| `src/ui/month-grid.ts` (+ `day-cell.ts`) | The month calendar with content-dots already rendered by Horizon |
| `src/ui/popover.ts` — `showDayPopover` (shell, if anchor-reusable) | Popover positioning/anchoring; else a thin popover wrapper |
| `src/settings.ts` — `periods.daily`, `confirmBeforeCreate` | Daily folder/format/template; existing create-confirm semantic |

**Note on the calendar popover:** `showDayPopover` renders a day's *content*. The daybar needs a date *picker* (month grid to select a date). Implementation reuses `month-grid.ts` rendering inside a popover anchored to the pill. If the `popover.ts` anchoring shell is reusable, reuse it; otherwise a thin popover wrapper (<40 lines) hosts the grid. This is the one place a small amount of new UI plumbing may be needed beyond `daybar.ts`.

---

## 4. Interaction model

The nuance that implements "create only on explicit click":

```
Normal state:            ‹  21 Jul 2026  ›

click › on EXISTING day  → openPeriodicNote(target) immediately
                           (view navigates; daybar re-renders for the new day)

click › on EMPTY day     → pill enters PENDING state:
                             ‹  22 Jul 2026 ·＋  ›   (dimmed date + create affordance)
                           - click date / ＋  → ensurePeriodicNote(target) + open
                           - click ‹ or click away → reset to 21 (no note created)

click LABEL              → calendar popover (month-grid, content dots, ⊙ today)
                           - click day: exists? open : create+open
```

Existence check per direction uses `PeriodicService` to resolve whether the target `DayKey`'s file exists in `periods.daily.folder`. The PENDING state is transient UI local to the current view; it never persists and creates nothing until confirmed.

`confirmBeforeCreate` (existing setting) governs whether the popover's "click empty day" also requires the same explicit confirm, keeping daybar and calendar-tab behavior consistent.

---

## 5. UI placement

```
┌─ view-header ────────────────────────────────────────────────┐
│ • Tue, 21 Jul                          ‹ 21 Jul 2026 ›  ⋯  ⤢ │  ← pill left of action icons
├───────────────────────────────────────────────────────────────┤
│   • Tue, 21 Jul                                               │  ← body: strict format, untouched
│       • morning intention                                     │
```

- Mounted as a custom element in `view.headerEl` `.view-actions` (not `view.addAction`, which only yields icon buttons — the pill needs a text label + arrows).
- **Anti-duplicate guard**: a per-host `data-token` marker, because Obsidian rebuilds the header on some layout events. Same pattern as the tabx hydration guard. Re-mount is idempotent.
- **Mobile** (`isDesktopOnly: false`): `.view-actions` is cramped on phone → compact degradation (label only, reduced padding). Desktop-first; mobile polish is non-blocking.

---

## 6. Files

| File | Type | Scope |
|---|---|---|
| `src/ui/daybar.ts` | new | ~150–250 lines: render pill, arrows, pending-state, popover wiring |
| `src/ui/daybar.test.ts` | new | pure logic: step→target, exists?→nav/pending, label format, today |
| `src/main.ts` | edit | ~40 lines: leaf-change/file-open listener → mount/unmount + cleanup |
| `src/settings.ts` + `src/settings-tab.ts` | edit | `daybar` on/off toggle (default on); optional label date format |
| `styles.css` | edit | pill + pending-state styling |

---

## 7. Testing & risk

- **TDD** on pure logic in `daybar.test.ts` (Horizon already uses vitest: `dates.test.ts`, `periodic.test.ts`). Test: `decideAction(currentKey, direction, exists) → {kind: 'nav' | 'pending', target}`; label formatting; today resolution. DOM mount verified manually in-app.
- **Risk: low.** Additive, lifecycle-safe (unmounts with the leaf), does not touch the strict daily body format.
- **Known constraints:** Obsidian header rebuilds → idempotent mount guard required. Mobile header width → compact degradation.

---

## 8. Out of scope (YAGNI)

- Weekly / monthly / yearly periods (future: the pill becomes period-aware).
- A standalone "today" button in the pill (lives in the popover instead).
- Any change to daily-note frontmatter or body format.
