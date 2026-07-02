# Horizon

Calendar for your Obsidian vault: daily and periodic notes, tasks, and dated notes in one place.

## Views

- **Sidebar mini calendar** — month at a glance with content dots: daily note (accent), due tasks (orange), overdue (red), scheduled (cyan), done (green), dated notes (gray). ISO week numbers open weekly notes.
- **Calendar tab** (ribbon icon or `Horizon: Apri il calendario`) with three modes:
  - **Mese** — 7-column grid with content chips per day; "+N altri" jumps to the week view
  - **Settimana** — seven full-height columns, every chip visible
  - **Agenda** — chronological list of the upcoming days that have content

## Data sources

1. **Daily / weekly / monthly / yearly notes** — existence resolved live from the per-period folder + filename format configured in settings (monthly/yearly are off by default)
2. **Tasks** with obsidian-tasks-plugin emoji dates: 📅 due, ⏳ scheduled, ✅ done. Cancelled tasks (status `-`) are hidden
3. **Notes with a `date` frontmatter property** (periodic notes are excluded to avoid duplicates)

## Interactions

- Click a day (or its number in the tab view) → open the daily note, creating it from the template when missing ({{title}}, {{date:FMT}}, {{time:FMT}} tokens fill against the target day). Mod-click opens in a new tab
- Click a week number → open/create the weekly note
- Hover a day with a note → native page preview
- **Checkbox on a task chip** → toggle done with a `✅` date, Tasks-plugin compatible. Recurring (🔁) tasks open at the line instead — completing them needs the Tasks rrule engine
- **Drag a task chip onto another day** (any view, including the sidebar) → its date field is rewritten in the source file. Writes are guarded: exact text at the expected line, unique-match fallback, abort on ambiguity

## Notes

- Replaces the community **Calendar** plugin — disable it manually to avoid two sidebar calendars
- The stale Periodic Notes config is ignored on purpose; Horizon keeps its own per-period settings (first launch seeds the daily period from `daily-notes.json`)
- Templater syntax in templates passes through unexecuted (core-Templates tokens only)

## Development

```bash
pnpm i
pnpm dev        # esbuild watch
pnpm build      # typecheck + production build
pnpm test       # node native test runner (74+ unit tests, no Obsidian needed)
pnpm lint
```

Architecture: a pure per-day index (`src/index/`) fed by `metadataCache` events, consumed by two `ItemView`s (`src/ui/`). All date math is UTC-immune (`src/dates.ts`); file writes go through guarded line edits (`src/edits/`). Pure modules never import the Obsidian runtime, so the whole read/write logic tests headless.
