---
date: 2026-07-02
topic: horizon-improvements
focus: miglioramenti al plugin Horizon v0.1
mode: repo-grounded
---

# Ideation: Horizon improvements (post v0.1)

Structured ideation: 4 framed generators (pain/friction, inversion/automation, leverage/compounding, analogy/constraint-flip) + web research (Full Calendar, Day Planner, Time Ruler, Journals, Liam Cain Calendar issues, calendar-bases, obsidian-tasks Urgency, Sunsama/Akiflow). ~32 raw ideas → dedupe → 7 survivors.

## Ranked Ideas

### 1. Overdue triage suite
**Description:** Pinned "In ritardo" section on today (all views), snooze presets on chip contextmenu (Oggi/Domani/Lunedì/+1w), batch "porta tutto a oggi".
**Warrant:** `direct:` overdue tasks bucket only under their past due day; agenda iterates forward from today — the tasks most needing attention appear in no view the user opens. `external:` Sunsama rollover, Todoist overdue prompt, email snooze.
**Confidence:** 90% · **Complexity:** Medium · **Status:** Explored (selected → v0.2 plan)

### 2. Time-of-day first-class
**Description:** Stop discarding the time in `date` frontmatter; chronological note sort; HH:mm chip prefix; unlocks week hour-lanes and future ICS.
**Warrant:** `direct:` `ISO_DATE_PREFIX_RE` explicitly discards the time suffix; notes sort alphabetically; vault has ~360 dated notes (Granola meetings) vs ~12 task files.
**Confidence:** 90% · **Complexity:** Low-Medium · **Status:** Explored (selected → v0.2 plan)

### 3. Quick capture on a day
**Description:** "+ task" on day cells writing `- [ ] text 📅 date` into the daily note; extension: undated-task tray with drag-to-schedule.
**Warrant:** `external:` GCal/Fantastical/Todoist quick-add. `direct:` calendar is currently mutation-only (reschedule/toggle).
**Confidence:** 85% · **Complexity:** Medium · **Status:** Unexplored (not selected)

### 4. Agent-native calendar
**Description:** Index export (JSON agenda for skills/agents), guarded write API, ghost-chip proposals (agent proposes placements, human accepts/dismisses — Google Docs suggested-edits pattern).
**Warrant:** `direct:` vault is a Claude Code working directory; index + guarded edits already exist. `external:` suggested-edits trust pattern.
**Confidence:** 80% · **Complexity:** Medium-High · **Status:** Explored (selected → v0.2 plan)

### 5. Horizon as Bases view
**Description:** `registerBasesView` month layout with configurable date property; every `.base` gets a calendar; retires third-party calendar-bases.
**Warrant:** `direct:` masonry already proved this integration in this codebase (`masonry/src/bases-view.ts`). `external:` calendar-bases is month-only, single-property.
**Confidence:** 85% · **Complexity:** Medium · **Status:** Explored (selected → v0.2 plan)

### 6. Weekly/daily automation
**Description:** Pre-compiled weekly digest from the index + `{{agenda}}` template token so daily notes are born with the day's context.
**Warrant:** `direct:` the vault's `/weekly-review` skill already encodes "Mario reads, doesn't compile"; template engine + index exist, this composes them.
**Confidence:** 80% · **Complexity:** Medium · **Status:** Explored (selected → v0.2 plan)

### 7. UX polish pack
**Description:** Chip hover preview; overflow popover (not view-switch); sidebar↔tab month sync; keyboard commands + arrow nav; undo on drop.
**Warrant:** `direct:` each verified in source (dataset.path unused for hover, onOverflow switches mode, only activeDate shared, 3 commands total, Notice not actionable).
**Confidence:** 95% · **Complexity:** Low · **Status:** Explored (selected → v0.2 plan)

## Rejection Summary

| Idea | Reason rejected |
|---|---|
| Time-debt ledger (aging + bankruptcy) | Duplicates overdue suite with more conceptual weight |
| Level my week (heijunka) | Depends on capacity/fallow primitives that don't exist; expensive now |
| Recurring 🔁 complete in-place | Reimplementing Tasks' rrule subset = correctness risk; current block is safe |
| DateSource provider registry | Premature platformization; no second consumer yet (YAGNI) |
| Multi-day date ranges | No consumer in vault today; revisit for projects/sprints |
| Configurable frontmatter date properties | Largely covered by the Bases view (per-Base property mapping) |
| Retrospective heat layer / streaks | Below survivors in expected value; future delight candidate |
| Capacity shading + fallow days | Novel but heavy behavioral bet; revisit after core matures |

## Prior-art notes (web research)

- **Time Ruler** proves a calendar can be a read/write projection over multiple metadata dialects without owning the schema — validates Horizon's multi-source stance.
- **obsidian-tasks Urgency** formula (due-dominant scoring) is ready-made if overdue ordering ever needs priority weighting.
- **Full Calendar** keeps remote calendars strictly read-only ICS/CalDAV — the sane model if external calendars ever land (phase 3).
- **calendar-bases** (Edrick Leong) is month-only, frontmatter-property-only, FullCalendar.js-based — Horizon's Bases view differentiates on multi-source + native rendering.
- **Sunsama** shutdown ritual vs **Akiflow** speed: two opposite philosophies; overdue suite borrows the selective-rollover prompt without the full ritual.
