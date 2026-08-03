# Horizon Day/Week Preview Panel — Design Spec

**Date:** 2026-08-03
**Status:** Approved (design) — pending implementation plan
**Repo:** obsidian-horizon
**Scope:** small–medium — 1 new UI module + 1 shared-helper extraction + wiring

---

## 1. What & why

Below the sidebar mini-calendar (`HorizonSidebarView` → `MonthGrid`), the space is empty. Two persistent preview panels — one for the active day's daily note, one for the active week's weekly note — turn that space into a live surface for the two periodic notes Mario writes most, without leaving the sidebar.

**Example**
- Before: to check today's note content, or to check/create this week's note, you switch to the main pane or hunt for the week-number column (hidden today — `showWeekNumbers: false` in the installed vault config).
- After: both are always visible under the mini-calendar; clicking either opens (or creates, with the existing confirm) the note.

---

## 2. Decisions (locked during brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Which day drives the day panel | **Active date** (`ctx.uiState.activeDate`) | Consistent with the shared UI state already driving the sidebar/calendar |
| Layout | **Day panel, then Week panel** (no compact "week notes list") | Keeps scope tight; a day-list index is a separate, un-asked-for feature |
| Which week drives the week panel | **Week of the active date**, not always "this calendar week" | Mirrors day-panel behavior; navigating the calendar navigates both panels together |
| Week panel richness | **Lightweight excerpt** (title + excerpt + thumb), not full markdown render | Fits the ~264–280px sidebar; consistent visual language with the day panel |
| Missing note (either panel) | **Empty-state, click-to-create** — no silent auto-creation | Respects `confirmBeforeCreate: true`, already set in the installed vault config |
| Component shape | **One generic `PeriodPreviewPanel`**, instantiated twice (daily/weekly) | Day and week panels are the same logic parameterized by period; avoids ~80% duplication |

---

## 3. Architecture

One new module, `src/ui/period-preview-panel.ts`, plus a small extraction from `src/ui/note-card.ts`. No new data source — both panels read through `PeriodicService` and `NotePreviewService`, already used elsewhere.

```
HorizonSidebarView.onOpen()
        │
        ├─ MonthGrid                              (existing, unchanged)
        ├─ PeriodPreviewPanel(daily)   key = activeDate
        └─ PeriodPreviewPanel(weekly)  key = startOfWeekMonday(activeDate)
```

### Reused modules (no rewrite)

| Module | Used for |
|---|---|
| `src/index/periodic.ts` — `PeriodicService.noteFor/pathFor` | Resolve whether the daily/weekly note exists for a given `DayKey` |
| `src/edits/note-creator.ts` — `openPeriodicNote` | Open existing note, or confirm+create+open when missing — unchanged |
| `src/preview.ts` — `NotePreviewService.getPreview` | Excerpt + cover image extraction, already cached by path:mtime:chars |
| `src/ui/note-card.ts` | Source of the extracted `renderPreviewBody` helper (title/excerpt/thumb + fade-in) |
| `src/dates.ts` — `startOfWeekMonday`, `isoWeek` | Derive the week's Monday key and week number for the weekly panel's heading |
| `src/ui/interactive.ts` — `makeButtonLike` | Keyboard/semantic contract for the panel's single clickable body |
| `src/state.ts` — `UiState.subscribe` | React to active-date changes without new plumbing |

**Extraction note:** `renderNoteCard` (`note-card.ts:10-52`) inlines excerpt+thumb+fade-in fetch logic with no rejection handling. This design extracts that body into `renderPreviewBody(ctx, bodyEl, file, chars): void`, called by both `renderNoteCard` and `PeriodPreviewPanel`. The extraction adds error handling around the preview fetch — closing a latent unhandled-rejection gap in the existing call site as a side effect of the reuse, not a separate fix.

---

## 4. Interaction model

```
PeriodPreviewPanel(ctx, containerEl, { period, keyFor, heading })

render():
  key = keyFor(ctx.uiState.activeDate)
  note = ctx.periodic.noteFor(period, key)
  header.setText(heading(key))
  note exists    → renderPreviewBody(ctx, body, note, previewCharacters)
  note missing   → body: "No note yet" placeholder

click/Enter on panel body (either state):
  → openPeriodicNote(ctx, period, key, Keymap.isModEvent(event))
    - note exists   → opens it
    - note missing  → confirm (if confirmBeforeCreate) → create from template → open
```

No new creation or confirmation logic — the entire "click empty panel" path is the existing `openPeriodicNote` call, the same one already wired from `MonthGrid`'s day/week clicks.

Re-render triggers (`onload()`): `ctx.uiState.subscribe()` (active date changes) and `ctx.dayIndex.subscribe()` (note created/removed elsewhere — same pattern `MonthGrid` already uses).

**Disabled period:** if `settings.periods.weekly.enabled` is `false`, `noteFor` already returns `null` regardless of file existence — the panel would misreport "No note yet" for a disabled period. `PeriodPreviewPanel` checks `ctx.settings.periods[period].enabled` directly and hides itself (no header, no body) when the period is off, rather than showing a misleading empty-state.

---

## 5. UI placement

```
┌ Horizon (sidebar) ──────────────┐
│  ‹      August 2026     ● ›     │  ← MonthGrid, unchanged
│  Mo Tu We Th Fr Sa Su           │
│  …                              │
├──────────────────────────────────┤
│  3 Aug                          │  ← PeriodPreviewPanel(daily)
│ ┌──────────────────────────────┐│
│ │ Post — Webinar deepagent 2.0 ││
│ │ piattaforma deepagent. …     ││
│ └──────────────────────────────┘│
├──────────────────────────────────┤
│  W32 · 3 Aug – 9 Aug            │  ← PeriodPreviewPanel(weekly)
│ ┌──────────────────────────────┐│
│ │ No note yet                  ││
│ │ Click to create               ││
│ └──────────────────────────────┘│
└──────────────────────────────────┘
```

Mounted as two additional `addChild()` components in `HorizonSidebarView.onOpen()`, below the existing `MonthGrid` div — no header-chrome changes, no new view type.

---

## 6. Files

| File | Type | Scope |
|---|---|---|
| `src/ui/period-preview-panel.ts` | new | ~120–180 lines: `PeriodPreviewPanel` component, both instances configured in `sidebar-view.ts` |
| `src/ui/period-preview-panel.test.ts` | new | pure logic: weekly heading format, `keyFor` derivation, enabled/disabled branch |
| `src/ui/note-card.ts` | edit | extract `renderPreviewBody`, keep `renderNoteCard` as a thin wrapper |
| `src/ui/sidebar-view.ts` | edit | mount the two panel instances, wire disposal in `onClose()` |
| `src/settings.ts` + `src/settings-tab.ts` | edit | `notePreviewPanels: boolean` toggle (default `true`, covers both panels), same pattern as `daybar` |
| `styles.css` | edit | `.horizon-period-panel` + header/body/empty-state classes |

---

## 7. Testing & risk

- Repo convention: pure logic gets unit tests (`dates.test.ts`, `periodic.test.ts`, …); DOM `Component` classes (`MonthGrid`, `WeekView`) have no dedicated test files and are verified manually in the live vault. `PeriodPreviewPanel` follows the same split — its `keyFor`/`heading` functions are unit-tested, mount/click/subscribe wiring is verified manually after `pnpm build` deploys to the vault.
- All new copy must pass `src/i18n-contract.test.ts` (English only — "No note yet", "Click to create", etc.).
- New CSS classes must have real declarations, checked by `src/style-contract.test.ts`.
- **Risk: low.** Additive only; no existing render path, data source, or note-creation logic is changed except the `note-card.ts` extraction (behavior-preserving, adds error handling where none existed).

---

## 8. Out of scope (YAGNI)

- A compact list of "this week's daily notes" (the idea floated, then dropped, during brainstorming — different from embedding the weekly note itself).
- Full markdown rendering of either note (`journal-view.ts`'s pattern) — excerpt-only for both panels.
- Turning on `showWeekNumbers` in the installed vault settings — unrelated, a one-click toggle Mario can flip himself if he still wants the week-number column too.
- Independent enable/disable for day vs. week panel (single `notePreviewPanels` flag covers both).
