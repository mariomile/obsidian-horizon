# Horizon — new Obsidian calendar plugin

## Context

Mario currently uses two calendar plugins: **Calendar** by Liam Cain (sidebar mini-calendar, daily notes only, word-count dots) and **Calendar Bases**. Confirmed pain points: (1) dated design, (2) daily-notes-only content, (3) no real month/week/agenda navigation, (4) periodic notes are second-class.

Decision: build a new custom plugin, **Horizon**, at `.obsidian/plugins/horizon/`, replacing the Calendar plugin. Vault-internal data only (Google Calendar = possible phase 2).

### Validated design decisions (brainstormed with Mario)

- **Form factor**: sidebar mini-calendar + full-tab view with Month / Week / Agenda modes
- **Data sources**: daily+periodic notes, tasks with emoji dates (📅 due, ⏳ scheduled, ✅ done), notes with `date` frontmatter
- **Interactivity**: click empty day → create daily/periodic note (template support); drag task chip to another day → rewrite its date in the source file; checkbox on chip → toggle done with ✅ date (Tasks-plugin syntax)
- **Architecture**: vanilla TypeScript, no frameworks, zero runtime deps — same stack as masonry (pnpm + esbuild + TS strict + native node test runner)
- **Design**: Obsidian CSS variables only, theme-aware dark/light; UI copy in Italian (like masonry)

### Verified vault facts (grounding)

- `.obsidian/daily-notes.json`: format `DD-MM-YYYY`, folder `Journal/Daily`, template `_system/templates/Daily-Note` (**no `.md` extension** — resolver must append it or use `getFirstLinkpathDest`)
- Weekly notes already exist at `Journal/Weekly/2026-W15.md` → format `GGGG-[W]WW` (ISO week-year, Monday start). Template `_system/templates/Weekly-Note.md` exists. The periodic-notes plugin config is **stale** (`4. Logs/Weekly`) — ignore it entirely
- `Journal/Monthly` / `Journal/Yearly` don't exist yet but templates do → defaults `YYYY-MM` / `YYYY`, **disabled by default** (settings toggle)
- Templates use **core-Templates syntax** (`{{date:YYYY-MM-DD}}`), not Templater → plain token substitution suffices
- Tasks plugin: `taskFormat: tasksPluginEmoji`, empty global filter, `setDoneDate: true`. Real lines include tab-indented sub-items, priorities (🔺⏫🔼), ➕ created. **Corrupt date exists in the wild** (`Journal/Daily/18-01-2026.md:18` ends `✅ 2026-05-0`) → strict date validation, skip invalid fields
- Daily notes carry `date:` frontmatter equal to their own day → frontmatter source must **exclude periodic-note paths** (no duplicates)
- Sync-conflict files exist (`25-06-2026 (Conflicted copy iPhone …).md`) → periodic resolution must use strict format round-trip matching
- Vault: ~7,110 md files; ~12 files contain dated tasks today, but design for hundreds

## Architecture

One shared **data layer** (per-day index) + two **view layers** subscribing to it.

Key technical decisions:

| Topic | Decision |
|---|---|
| Task index | `metadataCache.getFileCache(file)?.listItems` filters candidate files (`item.task !== undefined`); only those get `vault.cachedRead`. Incremental: `metadataCache.on('changed', (file, data, cache))` — `data` already contains file content, so single-file rescans need zero extra reads. `vault.on('rename'/'delete')` re-key/drop. Initial scan deferred to `workspace.onLayoutReady`, chunked (32 reads/batch), one 300ms debounced emit |
| Periodic notes | **Not indexed** — resolved on demand at render via `vault.getFileByPath(dateToPath(period, key))` (O(1), ~42 lookups per month render) |
| Date math | Pure `src/dates.ts` with `DayKey` = `'YYYY-MM-DD'` local y/m/d, native arithmetic — fully node-testable, DST/UTC-immune. `moment` (from `'obsidian'`, esbuild-external) used **only** for filename formats + template tokens behind a `MomentLike` injection seam; tests inject real `moment` as devDependency (never bundled) |
| Drag & drop | HTML5. `dragstart` → `dataTransfer.setData('application/x-horizon-task', JSON.stringify({path, line, rawText, dateKind}))`. Drop → `vault.process` with two-level guard: `lines[ref.line] === ref.rawText`, else unique exact-text search; 0 or >1 matches → abort with `Notice`. A chip rewrites its own date kind (📅 chip → 📅, ⏳ chip → ⏳) |
| Recurring 🔁 | Drag-reschedule **allowed** (rewriting 📅 = Tasks' "postpone", keeps rrule valid); checkbox completion **blocked** (needs rrule engine) → 🔁 badge on chip, checkbox click shows Notice + opens file at line |
| Views | Two `ItemView`s: `'horizon-sidebar'` (icon `calendar`, `ensureSideLeaf` right on layout ready) and `'horizon-calendar'` (icon `calendar-days`, ribbon + command, leaf-reuse like masonry `activateAllDocs()`) |
| Hover preview | Masonry pattern exactly: `registerHoverLinkSource` + views implement `HoverParent`, trigger `'hover-link'` on day-cell hover when note exists (see `masonry/src/gallery.ts:792-807`) |
| Sidebar↔tab sync | Both subscribe to the single `DayIndexService`; tiny `src/state.ts` pub/sub for `activeDate` + `calendarMode`; mode persisted in settings |
| Settings seed | `DEFAULT_SETTINGS` hardcodes verified values; on first run (no data.json) try re-seeding daily period from `configDir/daily-notes.json` in try/catch |

## File structure

```
.obsidian/plugins/horizon/
├── manifest.json            id "horizon", minAppVersion "1.10.0"
├── package.json             masonry scripts; test glob "src/**/*.test.ts"; + moment devDep
├── esbuild.config.mjs       copy masonry verbatim (CJS, es2021, obsidian external)
├── tsconfig.json / eslint.config.mjs / .gitignore   copy masonry verbatim
├── styles.css               Obsidian CSS vars only
└── src/
    ├── main.ts              HorizonPlugin: owns DayIndexService, PeriodicService, UiState;
    │                        registers views/ribbon/commands/settings tab/hover source
    ├── settings.ts          HorizonSettings, DEFAULT_SETTINGS, parseSettings(unknown), SettingTab
    ├── types.ts             DayKey, Period, TaskEntry, TaskDateKind, DayBucket, PeriodConfig, TaskRef
    ├── dates.ts (+test)     PURE: dayKey math, monthGrid(y,m)→42 DayKeys Monday-start, ISO weeks
    ├── state.ts             UiState pub/sub (activeDate, mode)
    ├── index/
    │   ├── task-line.ts (+test)        PURE: parseTaskLine, rewriteDate, toggleDone
    │   ├── task-scanner.ts (+test)     PURE extractTasks(path, content, {line,task}[]) + thin App wrapper
    │   ├── frontmatter-date.ts (+test) PURE normalizeFrontmatterDate(unknown)→DayKey|null + thin wrapper
    │   ├── periodic.ts (+test)         PURE (MomentLike): dateToBasename/basenameToDate strict
    │   │                               round-trip, dateToPath; thin PeriodicService
    │   ├── day-index.ts (+test)        PURE DayIndexCore: per-file contributions → byDay buckets,
    │   │                               set/remove/renameFile, getBucket, subscribe
    │   └── indexer.ts                  THIN DayIndexService: wires core to vault/metadataCache events
    ├── edits/
    │   ├── template.ts (+test)  PURE applyTemplate: {{title}}, {{date}}, {{date:FMT}} vs TARGET day
    │   ├── note-creator.ts      THIN createPeriodicNote: resolve template, ensure folder, create, open
    │   └── task-edit.ts         THIN rescheduleTask/toggleTaskDone: vault.process + guard + Notice
    └── ui/
        ├── sidebar-view.ts      ItemView hosting MonthGrid density 'mini'
        ├── calendar-view.ts     ItemView: header, mode switcher, hosts month/week/agenda
        ├── month-grid.ts        7-col Monday grid, ISO week gutter, 'mini' (dots) | 'full' (chips)
        ├── week-view.ts         7 columns, chip stacks
        ├── agenda-view.ts       next N days list, skip-empty
        └── day-cell.ts          shared cell: day number, today ring, dots/chips, checkbox, dnd, hover
```

Core model:

```ts
type DayKey = string;  // 'YYYY-MM-DD', always local
interface TaskEntry { path: string; line: number; rawText: string; description: string;
  status: string; done: boolean; recurring: boolean;
  due?: DayKey; scheduled?: DayKey; doneDate?: DayKey; cancelledDate?: DayKey; }
interface DayBucket { due: TaskEntry[]; scheduled: TaskEntry[]; done: TaskEntry[];
  notes: { path: string; title: string }[]; }  // periodic notes resolved at render, not stored
```

## Implementation steps (each independently commit-able, TDD where pure)

1. **Scaffold** — copy masonry configs, manifest, package.json, minimal main.ts + types.ts. Verify `pnpm i && pnpm build && pnpm lint`, plugin loads (obsidian-cli reload)
2. **`dates.ts`** (TDD) — 42-cell Monday monthGrid; ISO week year-boundary cases (2024-12-30 → W1/2025; 2027-01-01 → W53/2026); no UTC drift
3. **`task-line.ts`** (TDD) — fixtures from real vault lines incl. tab-indented, priorities, wikilinks, corrupt `✅ 2026-05-0` → no doneDate; rewriteDate idempotent; toggleDone refuses 🔁 and non-todo statuses
4. **`task-scanner.ts` + `frontmatter-date.ts`** (TDD) — pure cores never import runtime API; thin App adapters
5. **`periodic.ts`** (TDD, real moment injected) — strict round-trip rejects conflicted-copy filenames; fixtures `02-07-2026`, `2026-W15`, `YYYY-MM`, `YYYY`
6. **`day-index.ts` core + `indexer.ts`** (TDD on core) — multi-date task lands in multiple buckets; frontmatter note excluded when path is periodic; chunked initial scan; incremental `changed` update using event's content payload
7. **`settings.ts` + main.ts wiring** — per-period `{enabled, folder, format, template}`, `agendaHorizonDays: 14`, week numbers, per-source visibility, `confirmBeforeCreate`, `lastMode`; defensive `parseSettings` (masonry style); first-run seed from daily-notes.json; Italian copy
8. **Sidebar view (read-only)** — month-grid + day-cell 'mini' + registration; dots for note/tasks; prev/today/next; week gutter; styles.css with `--interactive-accent`, `--background-secondary`, `--text-muted`, `--radius-s`. Visual check via obsidian-cli screenshot
9. **Create/open interactions** — `template.ts` (TDD: `{{date:FMT}}` fills TARGET day) + note-creator + ConfirmModal; day click opens-or-creates daily (Keymap.isModEvent → new tab); week-gutter click → weekly; hover preview wiring
10. **Full tab, Month mode** — calendar-view header + mode switcher; chips (daily-note, tasks with checkbox + kind badge, dated notes); chip click → `openLinkText` + `eState: {line}`; "+N" overflow; ribbon + command
11. **Week + Agenda modes** — week columns; agenda N days skip-empty; next/prev-period commands
12. **Checkbox toggle** — `toggleTaskDone` via vault.process + guard; 🔁 block; index self-heals via `changed` event (this is the sidebar↔tab sync test)
13. **Drag & drop** — chips draggable in all 3 modes + sidebar; drop rewrites the chip's own dateKind; `.horizon-cell--drop` hover state
14. **Polish** — `open-today-note` command, cancelled tasks filtered, empty states, README; note to manually disable community Calendar plugin (do NOT auto-disable)

## Masonry files to mirror (all under `.obsidian/plugins/masonry/`)

- `esbuild.config.mjs`, `tsconfig.json`, `eslint.config.mjs`, `.gitignore` → copy verbatim
- `src/main.ts` → registration/ribbon/command/leaf-reuse + `registerHoverLinkSource` pattern
- `src/all-docs-view.ts` → ItemView shape, `registerEvent` + debounced refresh (lines 97-103)
- `src/gallery.ts` → HoverParent + `hover-link` trigger (792-807), `Keymap.isModEvent` open, delegated events via `dataset`+`closest`
- `src/settings.ts` → `parseSettings(unknown)` defensive helpers (110-120) + SettingTab
- `src/utils.test.ts` → node:test + assert/strict conventions

## Risks / edge cases (mitigations decided)

- **Task rewrite safety**: line drift between render and drop → `vault.process` atomic + text-at-line guard + unique-search fallback; never write on ambiguity, Notice on abort
- **Corrupt emoji dates**: strict `\d{4}-\d{2}-\d{2}` + real-calendar validation; invalid field ignored, task still listed by valid dates
- **Timezone**: DayKeys from local y/m/d only; `toISOString()` banned in date code
- **Performance (7k files)**: cache-only for periodic/frontmatter; reads only for task-bearing files; chunked scan post-layout; bounded render
- **`--experimental-strip-types`**: erasable syntax only (no enums; type-only obsidian imports in tested modules)
- **Templates**: missing template → empty note + Notice; Templater syntax passes through unexecuted (documented limitation)

## Verification

1. **Unit tests**: `pnpm test` (node native runner) — dates, task-line grammar, scanner, periodic round-trip, day-index, template
2. **Static**: `pnpm typecheck && pnpm lint && pnpm build`
3. **Live in vault** (obsidian-cli): reload plugin → check sidebar renders current month with dots; open full view → switch Month/Week/Agenda; click empty day → daily note created from template with correct date; hover day → preview popover; drag a test task chip to tomorrow → 📅 date rewritten in file (verify with git diff); checkbox → ✅ today appended; 🔁 task checkbox → blocked with Notice; screenshot both views for design review
4. **Regression guard**: create a scratch task file in `_inbox/` for drag/toggle tests, clean up after
5. Suggested workflow: new branch `mario-codex/feat/horizon-plugin` (current branch is masonry's); copy this plan into `.obsidian/plugins/horizon/docs/plans/` as masonry does
