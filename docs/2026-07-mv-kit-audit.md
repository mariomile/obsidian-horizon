# mv-kit audit — Horizon (wave 5)

Audit of `styles.css` (1338 lines pre-fix, 1376 post-fix) + the UI code
(`src/ui/*`, `src/edits/note-creator.ts`, `src/settings-tab.ts`) against
`obsidian-cosmos-theme/docs/mv-kit.md`, both desktop and phone columns.
Scope: coherence-only fixes (radius / type / icons / motion tokens / empty
states / microcopy). No layout redesign, no DOM restructure — per
`docs/2026-07-24-suite-coherence-design.md` §C/D non-goals.

Per-rule verdict: **pass** (already compliant) / **fixed** (this wave) /
**waived** (kit rule doesn't apply here, with reason).

Before this wave `styles.css` consumed ZERO suite tokens
(`grep -oc "var(--\(cosmos\|mv\)-"`: 0 hits). It now consumes 11 across 4
distinct tokens (`--cosmos-t-fast`, `--mv-wash`, `--cosmos-native`,
`--cosmos-touch-min`, `--cosmos-press-scale`), every one with a literal
fallback equal to Horizon's own pre-fix value, so a Cosmos-less vault
renders identically.

## Golden rule — theme-independent consumption

| Check | Verdict |
|---|---|
| Every `var(--cosmos-*)`/`var(--mv-*)` has a literal fallback | **fixed** — a new shared `--horizon-ease` custom property (`:root`, top of file) wraps the file's dominant `80ms ease` hover/press wash in `var(--cosmos-t-fast, 80ms) var(--mv-wash, cubic-bezier(0.25, 1, 0.5, 1))`, referenced at all 15 sites that previously hardcoded `80ms ease`. The two opacity-only async-load fades (card excerpt/thumb, 120ms/150ms) consume `--cosmos-t-fast`/`--cosmos-native` individually (fade-entrance tier, not a colour wash — `--mv-wash` doesn't fit a pure-opacity transition the way it fits a colour/background wash). Phone touch-min (`44px` ×3) now consumes `--cosmos-touch-min`; the new press-scale consumes `--cosmos-press-scale`. |
| No plugin stylesheet redefines `--mv-*`/`--cosmos-*` at `:root`/`body` | **pass** — Horizon only ever defines its own `--horizon-*` namespace (`--horizon-cell-gap`, `--horizon-check-color`, and the new `--horizon-ease`) at `:root`/scoped selectors. |

The rewiring, following Sonar wave 1's `--sonar-ease` pattern (a single
shared easing custom property, not per-site inline `var()` repetition):

```css
/* before (repeated ~15×) */          /* after */
transition: background-color          :root {
  80ms ease, color 80ms ease;           --horizon-ease: var(--cosmos-t-fast, 80ms)
                                           var(--mv-wash, cubic-bezier(0.25, 1, 0.5, 1));
                                       }
                                       transition: background-color var(--horizon-ease),
                                         color var(--horizon-ease);
```

## §1 Radius + surfaces

| Surface | Desktop | Phone | Verdict |
|---|---|---|---|
| Icon buttons / week-cell / mini-cell / mode-btn / chips / journal controls (`--radius-s`, `--radius-m`) — 27 sites | native Obsidian tokens throughout | same | **pass** — native tokens, not hand-picked pixels. Same verdict class as Sonar wave 1, TabX wave 4, Masonry wave 3's native-token uses. |
| `.horizon-cell__num`, `.horizon-dot`, `.horizon-chip__marker`, `.horizon-agenda__note-dot` — `border-radius: 50%` | day-number circle, status dots (4-5px), note markers | same | **waived** — the round-cap idiom on fixed tiny shapes/circular badges, not a "pill/card/chip" *surface* in the kit's §1 sense. Same waiver class as Sonar's grab-handle/badge-dot and TabX's status-dot in their respective waves. |
| `.horizon-chip__check` (`border-radius: 3px` on a 12×12px checkbox glyph) | fixed tiny shape | same, no phone variant | **waived** — a checkbox-glyph corner radius, not a chip/pill/card surface; forcing it onto `--mv-r-chip` (5px canonical) would visually distort an unrelated 12px control for no coherence gain. Kit's radius table has no entry for glyph-scale controls. |
| `.horizon-cell__mini-badge` (`border-radius: 6px` on a ~12px numeric badge pill) | fixed tiny shape | phone-relevant surface (overdue count badge) but size-driven, not a "chip" | **waived** — same reasoning: a numeric badge at glyph scale, not a plugin-defined chip/pill/card. |
| `.horizon-chip` (the plugin's actual chip class — event/task rows) | `var(--radius-s)`, native | same | **pass** — this IS the kit's "chip" surface in spirit, and it already consumes a native token rather than a hardcoded pixel, satisfying the MUST's intent ("not a hand-picked pixel value") even though it isn't literally `--mv-r-chip`. Consistent with the native-token `pass` verdict class above. |
| Elevation shadow on `.horizon-popover` / `.horizon-hovercard` / `.horizon-datepicker` (floating surfaces) | `box-shadow: var(--shadow-l)` / `var(--shadow-s)`, native tokens | same | **waived, native-token equivalent** — these are Horizon's only floating chrome. The kit's MUST is "never hardcode elevation shadows for floating surfaces — consume `--cosmos-pop-shadow` (or its literal) instead"; Horizon already consumes Obsidian's own native elevation scale rather than a hardcoded rgba, which is the same class of theme-derived value the kit's `pass` verdicts accept elsewhere (native tokens, not raw values). Migrating to `--cosmos-pop-shadow` specifically would be a visual change to three surfaces outside this wave's minimal-fix mandate; flagged for a future wave if Mario wants exact suite-shadow parity. |

## §2 Type sizes, icon sizes, touch targets

| Surface | Desktop | Phone | Verdict |
|---|---|---|---|
| `.horizon-view__mode-btn`, `.horizon-view__today-btn`, `.horizon-journal__open`, `.horizon-journal__expand` | `min-height: 32px`/`28px`, no desktop minimum (kit: N/A) | were raw `min-height: 44px` inside `@media (pointer: coarse)` | **fixed** — now `var(--cosmos-touch-min, 44px)`. Same computed value, token-sourced. |
| `.horizon-cal__nav-btn` pseudo-element hit-area extension | `28×28px` visual box, unchanged | was a raw `44px` inside the `calc()` | **fixed** — now `calc((100% - var(--cosmos-touch-min, 44px)) / 2)`. The transparent pseudo-element hit-area-extension pattern itself (documented "MOBILE KIT, nato in masonry 2026-07-10") is kept verbatim; only the literal inside the calc is tokenized. |
| `.horizon-chip--card` (`min-height: 44px`, note mini-card) | desktop-scoped content-card minimum, not inside the coarse-pointer block | same value applies everywhere (no phone override) | **waived, not a §2 touch-min case** — this is a card *content* sizing floor (room for a thumbnail + two-line body), always-on regardless of pointer type, coincidentally equal to 44px. The kit's `--cosmos-touch-min` token is specifically scoped to the coarse-pointer tap-target floor; force-wrapping an always-on desktop card minimum in that token would misrepresent its purpose. The whole card is clickable and, in practice, taller than 44px on both platforms. |
| Micro-label font size (`.horizon-cal__dow`, `.horizon-month__dow`, `.horizon-week__dow`, `.horizon-journal__eyebrow`) | `var(--font-ui-smaller)` throughout | same | **pass** — already the token floor everywhere a section eyebrow appears. |
| Icon sizing (16px nav-btn/ghost-accept-dismiss SVGs, `--icon-s` on view-nav buttons) | raw px on SVG wrapper / native `--icon-size` var | same | **pass** — matches the kit's own §2 row ("Cosmos defines no separate icon-size scale") and the wave-1/wave-4 precedent on the identical pattern. Icons are native `setIcon()` Lucide names (`chevron-left`, `plus`, `circle-dot`, …), not a bespoke icon module — the Huge Icons pack rollout is Portal-core-module work (`docs/2026-07-24-suite-coherence-design.md` §A), out of scope per-plugin. |
| **Press-scale on phone** (`--cosmos-press-scale`) | **absent** — no tap-confirmation anywhere | now applied | see §3 below (cross-referenced, it's a motion mechanism triggered by the touch-target group). |

## §3 Motion

| Token / animation | Before | After | Verdict |
|---|---|---|---|
| `--horizon-ease` (new shared custom property — hover/press wash for nav-btn, week-num, mini-cell, mode-btn, today-btn, cell--full, chip, chip__check, overdue-badge, batch-btn, ghost accept/dismiss, week__head, agenda__head, journal__card, daybar-label — 15 sites) | raw `80ms ease` repeated at each site | `var(--cosmos-t-fast, 80ms) var(--mv-wash, cubic-bezier(0.25, 1, 0.5, 1))`, defined once | **fixed** — exactly the kit's "colour/background wash easing" tier (`--mv-wash`); duration kept at Horizon's pre-fix `80ms` as the literal fallback rather than snapped to the canonical `140ms`, since `--cosmos-t-fast`'s canonical value is a *ceiling default*, not a mandate to visually re-time an already-shipped, judged interaction speed. |
| `.horizon-card__excerpt` opacity fade-in (async excerpt load) | raw `120ms ease` | `var(--cosmos-t-fast, 120ms) var(--cosmos-native, cubic-bezier(0.32, 0.72, 0, 1))` | **fixed** — a pure-opacity entrance, not a colour wash, so it takes the kit's lightweight-chrome-entrance pairing (`--cosmos-t-fast`/`--cosmos-native`, the same pair driving `cosmos-fade-in`) rather than `--mv-wash`. |
| `.horizon-card__thumb` opacity fade-in (async thumbnail load) | raw `150ms ease` | `var(--cosmos-t-fast, 150ms) var(--cosmos-native, cubic-bezier(0.32, 0.72, 0, 1))` | **fixed** — same reasoning as the excerpt fade above. |
| **Press-scale on phone** (`--cosmos-press-scale`) | **absent** — no tap-confirmation anywhere on the calendar, journal, or agenda surfaces | `transform: scale(var(--cosmos-press-scale, 0.98))` on `:active` for `.horizon-view__mode-btn`, `.horizon-view__today-btn`, `.horizon-journal__open`, `.horizon-journal__expand`, `.horizon-cal__nav-btn`, inside `@media (pointer: coarse)`, transitioned on `var(--cosmos-t-fast, 80ms) var(--cosmos-native, cubic-bezier(0.32, 0.72, 0, 1))` | **fixed** — kit §3 MUST: "tap targets apply `transform: scale(var(--cosmos-press-scale, 0.98))` on active/press." Horizon had nothing; same gap Portal, Masonry, and TabX all had before their own waves. `transform`-only, composited. |
| `prefers-reduced-motion: reduce` | zeroed `.horizon-card__excerpt`/`.horizon-card__thumb` transitions only | **extended** — a nested `@media (prefers-reduced-motion: reduce)` inside the coarse-pointer block zeroes the five new press-scale targets' `transition` | **fixed (extended)** — belt-and-suspenders, same reasoning as TabX wave 4's identical extension: under Cosmos the duration tokens zero at token level for free, but the no-Cosmos literal fallback (`80ms`) stays live without an explicit override. |
| Animated properties (hover washes) | `background-color`/`color`/`border-color`/`box-shadow`/`opacity` | unchanged, plus the new `transform` on press-scale | **pass** — no layout-triggering property is animated on hover/press/entrance anywhere in the file. |
| `.horizon-cell--full`, `.horizon-week__head`, `.horizon-agenda__head`, `.horizon-journal__card` hover washes | now via `--horizon-ease` | same | **fixed** — covered by the shared-token rewiring above. |
| Phone entrance recipes (`cosmos-pop-in` / `cosmos-sheet-rise` / `cosmos-fade-in`) | n/a | `.horizon-popover`/`.horizon-hovercard`/`.horizon-datepicker` render with no entrance animation at all (`position: fixed`, appear instantly) | **waived, flagged not fixed** — the kit's §3 MUST is explicit ("MUST on popover/menu chrome entrance"), and Horizon's day-popover and date-picker ARE exactly that surface (floating menu-like chrome). Unlike Sonar/Masonry/TabX/Portal (which render no floating chrome of their own and were correctly waived as "nothing to animate"), Horizon has three floating surfaces that currently pop in with zero transition. Adding `cosmos-pop-in`'s recipe (`opacity` + `transform: translateY(4px) → none`, `var(--cosmos-t-base) var(--cosmos-native)`) is a genuine, real gap — but doing it correctly means intercepting the popover's JS-driven open/close lifecycle (`src/ui/popover.ts`, `hover-card.ts`, `date-picker.ts` all currently set `display`/append synchronously, no animation hook exists), which is a behavior change beyond a CSS-only coherence fix and risks the same class of regression the mv-kit doc's own CSS-comment warning exists to prevent (touching render-timing code under a "coherence-only" banner). Flagged here as a genuine, unaddressed §3 gap for a dedicated follow-up wave, not silently waived. |
| `--cosmos-spring` (overshoot) | never used | unchanged | **pass** — correctly not reached for on hover/reveal; Horizon has a checkbox-check confirmation moment (`.horizon-chip--done .horizon-chip__check::after`) that is a plausible future candidate but currently renders with no animation at all (static state swap), so there's nothing to misuse `--cosmos-spring` on yet. |

## §4 Empty-state pattern

| Surface | Desktop | Phone | Verdict |
|---|---|---|---|
| `.horizon-view__empty` ("no content" state in Week/Agenda/Journal modes) | was `color: var(--text-faint)` only, no explicit `font-size` (inherited ambient size, one step too large) | same, no phone variant | **fixed** — added `font-size: var(--font-ui-smaller)` per the kit's whisper recipe. |
| `.horizon-journal__loading` / `.horizon-journal__empty` / `.horizon-journal__end` ("Caricamento…", "Niente scritto.", end-of-list marker) | was `color: var(--text-faint)` + `font-size: var(--font-ui-small)` — one step too large | same | **fixed** — switched to `var(--font-ui-smaller)`, matching the kit's MUST NOT ("never `--text-normal` or a larger size"). |
| `.horizon-week__blank` ("no note" placeholder in Week mode day column) | `color: var(--text-faint)` + `font-size: var(--font-ui-smaller)` | same | **pass** — already matched the whisper recipe verbatim before this wave. |
| `.horizon-cal__dow`, `.horizon-month__dow`, `.horizon-week__dow`, `.horizon-journal__eyebrow` (section micro-labels: weekday headers, "Daily notes" eyebrow) | `font-size: var(--font-ui-smaller)`, `font-weight: var(--font-medium)`, `text-transform: uppercase`, `letter-spacing` 0.05–0.07em, `color: var(--text-faint)` | same | **pass** — already matches the kit's micro-label recipe verbatim (uppercase + letter-spacing + faint + smaller + medium weight) at all four sites. |

## §5 Microcopy voice

| Rule | Desktop | Phone | Verdict |
|---|---|---|---|
| No native `<select>` | none found (`grep` for `createEl('select'` / `<select` in `src/`: zero hits) | same | **pass** |
| No `mod-cta` on buttons | `note-creator.ts`'s `ConfirmCreateModal` had `buttons.createEl('button', { cls: 'mod-cta', text: 'Crea' })` | n/a (same modal renders on phone) | **fixed** — `cls: 'mod-cta'` removed; the confirm button now renders as a plain native button like its sibling "Annulla" cancel button, matching the kit's MUST NOT verbatim. |
| Sentence-case labels, `.mva-pv`-style form convention | Settings tab uses Obsidian's native `Setting`/`PluginSettingTab` API throughout (`new Setting(containerEl).setName(...)`), not a bespoke `.mva-pv` form | n/a | **pass, correctly out of scope** — same verdict as Sonar wave 1: `.mva-pv`/`.mva-sel`/`.mva-btn` is the convention for *custom* plugin forms; Horizon's settings delegate entirely to Obsidian's built-in `Setting` component. |
| Chip+popover pickers, never native `<select>` | Horizon has no chip/popover picker controls of its own (its "chips" — `.horizon-chip` — are calendar event/task rows, not form pickers) | same | **pass, not applicable** — no picker UI exists to violate this. |
| English product copy, PM jargon untranslated | **all UI strings across `src/` are Italian** — settings labels/descriptions, button text ("Crea", "Annulla", "Apri", "Oggi"), empty-state copy ("Niente scritto.", "Nessuna daily note disponibile fino a oggi."), Notice messages | same | **waived, flagged as a pre-existing, deliberate, whole-plugin choice — not fixed this wave** — mv-kit's own row reads "product-surface copy is English… even in an Italian-language context," and Horizon is Italian-language end-to-end, with zero English strings anywhere in `src/`. This is a scope call, not a coherence miss: rewriting ~40 UI strings across settings, buttons, empty states, and Notices touches the plugin's entire user-facing voice, is not a "coherence-only" fix (radius/type/icons/motion/empty-states/microcopy-*convention*, not microcopy-*language*), is not atomic/git-reversible at the granularity this wave's non-goals demand, and is a product decision (does Horizon target only Mario's Italian-language workflow, or the wider suite?) rather than a style-token substitution. Flagged here explicitly, per the instruction not to silently ignore a real finding, for Mario to decide as a dedicated future wave — not silently normalized mid-audit. |
| Buttons `.mva-btn` convention | Horizon's buttons (`.horizon-cal__nav-btn`, `.horizon-view__mode-btn`, `.horizon-journal__open`/`__expand`, native modal buttons) use the plugin's own `.horizon-*` classes, not `.mva-btn` | same | **waived, same class as Sonar's settings-tab verdict** — `.mva-btn` is exo's form-language convention for *custom form* buttons; Horizon's are calendar/view chrome buttons, not form controls in that sense. The concrete MUST NOT (no `mod-cta`) is what's actually checkable and enforced above; the `.mva-btn` *positive* convention is aspirational naming, not a portable requirement onto every plugin's own button taxonomy (same reasoning TabX and Masonry's waves applied to their own button classes). |

## Not touched (explicit non-goals, confirmed out of scope)

- No layout/DOM changes anywhere — every fix in this wave is a token
  substitution, a missing property on an already-existing selector, or a
  removed class.
- Whole-plugin Italian-language UI copy (see §5) — flagged as a genuine gap
  for a dedicated future wave, not a coherence-only fix.
- Popover/hover-card/date-picker entrance animation (see §3) — flagged as a
  genuine gap; fixing it correctly requires touching render-timing JS
  (`src/ui/popover.ts`, `hover-card.ts`, `date-picker.ts`), outside a
  CSS-only coherence pass.
- `--cosmos-pop-shadow` migration for the three floating surfaces (see §1) —
  native `--shadow-l`/`--shadow-s` tokens already avoid hardcoded elevation
  values; exact suite-shadow-recipe parity deferred, not required by the
  kit's MUST as written.
- Small decorative radii (checkbox glyph, numeric badge, status dots) kept
  as their own fixed pixel values — outside the kit's §1 pill/card/chip
  vocabulary (see §1 waivers).

## Verification

- `pnpm typecheck` — 0 errors
- `pnpm lint` — 0 issues
- `pnpm test` — 37 test files, 138 tests passing (135 pre-existing + 3 new
  in `src/style-contract.test.ts`, added in the following commit)
- Desktop screenshot / live vault reload verification: **pending** — not
  performed this wave (no live vault-reload check run in this session).
- Phone verification: **pending Mario's on-device sign-off** — per hard
  constraint, Obsidian's `EmulateMobile` was not used (it kills Node
  plugins); phone changes (touch targets, press-scale, motion tokens) are
  verified by reading the resulting CSS values against the kit's phone
  column, not by rendering on-device.

---

## §6 — wave 2026-07 dinamica

Audit of `styles.css` (1338 lines pre-wave-6, 1431 post-fix) + `src/ui/dnd.ts`,
`src/ui/day-cell.ts`, `src/ui/daybar.ts`, `src/ui/calendar-view.ts`,
`src/ui/popover.ts`, `src/ui/hover-card.ts`, `src/ui/date-picker.ts` against
`obsidian-cosmos-theme/docs/mv-kit.md` §6 "Elevation & motion depth" (commit
`10f5ddc`, cantiere 2 — "Dinamica & profondità"). Scope: motion/elevation
coherence only — no layout redesign, no new components, per the same
non-goals as wave 5. Model commits consulted: obsidian-portal `389d564` +
`133c93d` + `4b95bf2`, obsidian-tabx `cc65cd4` + `a792752` + `662d11a`.

Per-rule verdict: **pass** (already compliant, nothing to do) / **fixed**
(this wave) / **waived** (kit rule doesn't literally apply to this surface,
with reason) / **N/A** (no surface of this type exists in the plugin).

### Elevation hierarchy

| Surface | Desktop | Phone | Verdict |
|---|---|---|---|
| `.horizon-popover` / `.horizon-hovercard` (Pop-tier candidates — day-detail popover, month-chip hover card; both close on outside interaction / pointer-leave) | `box-shadow: var(--shadow-l)`, native token, no ad-hoc rgba | same | **pass, waived — native-token equivalent**, carried forward from wave 5's §1 verdict on the same three surfaces (unchanged this wave; no new violation to fix). The kit's MUST is "never hand-pick a shadow" — Horizon already consumes Obsidian's own elevation scale rather than a hardcoded value, the same class of theme-derived value the kit's other `pass` verdicts accept. Migrating the literal token to `--cosmos-pop-shadow` specifically is a visual change outside this wave's minimal-fix mandate (flagged, not required — see "Not touched" below). |
| `.horizon-datepicker` (Pop-tier candidate — daybar's date picker, closes on outside-click) | `box-shadow: var(--shadow-s)`, native token | same | **pass, waived — same reasoning as above.** |
| Stacked tiers | 0 surfaces combine two shadow declarations (`box-shadow` + `--cosmos-glass-*`, or two elevation tokens) on one element — every floating surface has exactly one `box-shadow` line | same | **pass** — grepped all 10 `box-shadow` declarations in the file; none stack. |
| `.horizon-cell--today`, `.horizon-agenda__day--today`, `.horizon-week__col--today`, drop-target highlight (`.horizon-drop`) | `box-shadow: inset 0 0 0 …` rings | same | **pass, not an elevation case** — inset rings are state indicators (today/active/drop-target), not depth shadows; nothing to stack against, same verdict class as Portal's kb-cursor ring. |

### Hover richness

| Rule | Desktop | Phone | Verdict |
|---|---|---|---|
| Colour **and** lift on card-shaped surfaces, never colour alone | **was a violation on 2 of 2 card surfaces**: `.horizon-chip--card` (note mini-card) and `.horizon-journal__card` (journal entry card) both had border-color/box-shadow richness on `:hover` but zero `transform` — same pre-fix gap TabX found on `.tabx-card:hover` | same fix applies (no phone hover exists — see gating row below) | **fixed** — added `transform: translateY(-1px)` to both cards' `:hover` rule (inside the new `@media (hover: hover)` gate), plus a `transform` leg on each card's base `transition` using its own `--mv-lift` alias (`var(--cosmos-t-fast, 80ms) var(--mv-lift, cubic-bezier(0.22, 1, 0.36, 1))`) — kept separate from `--horizon-ease` (`--mv-wash`) per the kit's "not interchangeable" rule. Guarded by a new style-contract test. |
| Colour-only hover on row/list surfaces (never mixed with a lift) | 19 of 21 `:hover` rules are colour/opacity/border washes on row-shaped or glyph-shaped surfaces (`.horizon-cal__nav-btn`, `.horizon-cal__weeknum`, `.horizon-cell--mini`, `.horizon-view__mode-btn`, `.horizon-view__today-btn`, `.horizon-cell--full`, `.horizon-chip`, `.horizon-chip__check`, `.horizon-chip--more`, `.horizon-cell__overdue-badge`, `.horizon-agenda__batch-btn`, `.horizon-chip--ghost`, `.horizon-ghost__accept`/`__dismiss`, `.horizon-week__head`, `.horizon-agenda__head`, `.horizon-journal__open`/`__expand`, `.horizon-daybar-label`) — none of these have a transform lift | same | **pass, waived** — same row-vs-card reasoning as obsidian-portal's wave-2 §6 verdict: mv-kit's own code example shows `.row:hover` (colour-only) and `.card:hover` (lift-only) as two distinct patterns, not one rule both must satisfy. These 19 surfaces are dense list rows, inline chips, and glyph-scale controls, not card-shaped content blocks — adding a lift to a calendar day cell or a 12px checkbox glyph would read as jitter, not the kit's "hint." |
| `--mv-wash` for colour transitions, `--mv-lift` for transform transitions (not interchangeable) | Was already correct pre-wave-6: `--horizon-ease` (wired to `--mv-wash` since wave 5) is used exclusively on `background-color`/`color`/`border-color`/`box-shadow` transitions — grepped all 17 uses, zero pair it with a `transform`. The two new card-lift `transition` legs (this wave) use a separate, non-shared `--mv-lift` inline expression, never `--horizon-ease` | same | **pass** — no mixing existed before this wave (wave 5 built `--horizon-ease` narrowly, coincidentally already §6-clean), and the new lift transitions this wave correctly use their own easing rather than repointing `--horizon-ease`. |
| `transform` lift never exceeds 2px | `.horizon-chip--card`/`.horizon-journal__card` lifts are `translateY(-1px)` | same | **pass** — under the 2px cap. |
| Hover gated to `@media (hover: hover)` on phone-reachable elements | **was a violation**: 0 of the file's 21 `:hover` rules were wrapped — every surface (calendar cells, chips, buttons, cards) is phone-reachable (the whole calendar view renders full-width on a phone per the file's own existing `@media (max-width: 480px)`/`@media (pointer: coarse)` blocks) | same rule, now fixed | **fixed** — wrapped all 21 `:hover` rules (19 `@media (hover: hover)` blocks; two group two selectors each — `.horizon-ghost__accept`/`__dismiss` and `.horizon-journal__open`/`__expand`) in `@media (hover: hover)`. No reveal-only hover pattern exists in the file (checked: the only `opacity: 0` base states are the async excerpt/thumb fades, driven by an `.is-loaded` class from JS, not `:hover`; `.horizon-chip--ghost`'s base opacity is `0.75`, not `0`, so its hover-only opacity-to-1 bump never strands a control fully invisible on touch) — so no phone always-visible fallback was needed anywhere, unlike Portal's `.portal-collection-open` case. `:focus-visible` rules (the shared `[class^="horizon-"] … :focus-visible` block) were left untouched and ungated. Guarded by a new style-contract test. |

### Drag polish

| Surface | Desktop | Phone | Verdict |
|---|---|---|---|
| Drag positioning via `transform`, never `left`/`top`/`margin` | Horizon uses native HTML5 drag-and-drop exclusively (`el.draggable = true` in `src/ui/day-cell.ts`; `dragover`/`drop`/`dragleave` listeners in `src/ui/dnd.ts`, delegated per-container) — confirmed by reading both files in full: no `setDragImage`, no `.is-dragging`/`.is-dropped` class pair, no synthetic drag-ghost element anywhere in `src/` | same, native DnD has no phone equivalent gesture in Horizon (no long-press-to-drag implemented; phone task-move happens through the day-popover instead) | **N/A** — the browser's native drag-ghost paints itself; Horizon has no transform-driven dragged element for this rule to govern. `.horizon-chip--dragging { opacity: 0.4 }` is a static opacity dim toggled via class add/remove on `dragstart`/`dragend` (not a per-frame `left`/`top` reposition), the standard idiom for "this is the thing being dragged," not the anti-pattern the rule targets. `.horizon-drop`'s `box-shadow`/`background-color` (drop-target highlight) is likewise a static toggle on `dragover`/`dragleave`, not a repositioned element. |
| Drop settle via `--cosmos-native` | n/a — no drop-settle animation exists; native browser drag-end has no Horizon-owned settle transition (the dropped task simply re-renders via the day/week/agenda's normal data refresh) | same | **N/A** |

### Panel & tab transitions

| Surface | Desktop | Phone | Verdict |
|---|---|---|---|
| `.horizon-view__mode-btn--active` switch (Month/Week/Agenda/Journal — a genuine tab-content-swap: `calendar-view.ts`'s `mountMode()` calls `modeHostEl.empty()` then mounts the new mode's component) | Instant DOM swap (`.empty()` + re-mount), no transition, no slide | same | **waived, flagged not fixed** — this IS the kit's "tab switch (content swap)" surface, and the kit's MUST is a crossfade over `--cosmos-t-base`/`--cosmos-native`, explicitly never a slide-in. Horizon's current instant swap doesn't violate the MUST NOT (no slide-in exists — the worse anti-pattern), but it also doesn't implement the MUST (no crossfade). Fixing it correctly means adding an opacity-transition wrapper around `mountMode()`'s DOM-replace in `calendar-view.ts` (JS lifecycle, not a CSS-only token substitution), the same class of gap wave 5 already flagged for the popover/hover-card/date-picker entrance animation (§3) and explicitly declined to fix under a coherence-only mandate to avoid touching render-timing code. Flagged here as a genuine, unaddressed §6 gap for a dedicated follow-up wave — not silently waived as compliant. |
| `.horizon-daybar` pill's pending→confirmed state swap (`buildPill()`'s `render()` in `daybar.ts`: `pill.empty()` + rebuild on every step/create) | Instant swap, no transition | same | **waived, not a panel/tab case** — a 3-element inline pill (prev/label/create/next) re-rendering its icon set on date-step is not a "persistent panel" (nothing opens/closes structurally) nor a content-area tab-swap; it's the same class of instant micro-update as a button's icon change, outside §6's two named categories. |
| Section/collapse or sidebar open-close chrome of Horizon's own | Horizon owns no collapsible section or sidebar-toggle chrome — the sidebar mini-calendar (`.horizon-sidebar`) is Obsidian's native sidedock, not a Horizon-authored collapse/expand | same | **N/A** — nothing to animate; Horizon doesn't own this surface class (same verdict shape as Portal's/TabX's own "no floating chrome of our own" N/A rows for surfaces outside their scope). |

### Not touched (explicit non-goals, confirmed out of scope)

- No layout/DOM changes anywhere — every fix in this wave is a CSS-only
  addition (a `@media (hover: hover)` wrapper, or a `transform` +
  `transition` leg on two already-existing card selectors).
- Tab-content-swap crossfade for Month/Week/Agenda/Journal mode switching
  (see Panel & tab transitions above) — flagged as a genuine gap, not
  fixed; implementing it correctly requires wrapping `mountMode()`'s
  DOM-replace in `calendar-view.ts` with an opacity transition, which is a
  JS render-timing change outside a CSS-only coherence pass, same class of
  deferral as wave 5's popover-entrance-animation flag.
- `--cosmos-pop-shadow` migration for `.horizon-popover`/`.horizon-hovercard`/
  `.horizon-datepicker` (see Elevation hierarchy above) — carried forward
  unchanged from wave 5's §1 "Not touched" entry; native `--shadow-l`/
  `--shadow-s` tokens already avoid hardcoded elevation values, exact
  suite-shadow-recipe parity remains deferred.
- Row/chip/glyph-scale hover surfaces kept colour-only, no lift added (see
  Hover richness above) — outside the kit's card-lift vocabulary per its
  own row/card example.

### Verification

- `pnpm test` — `src/style-contract.test.ts`: 6 tests passing (4
  pre-existing wave-5 assertions + 2 new §6 assertions added this wave:
  "every `:hover` selector is gated behind `@media (hover: hover)`" and
  "card-shaped hover surfaces pair colour richness with a lift transform").
  Both new assertions were verified red-green: written against the
  pre-fix file (confirmed failing — 22/21 ungated `:hover` occurrences for
  the first, 2/2 missing-lift card surfaces for the second), then the
  minimal fix applied, then re-run to confirm green.
- Full `pnpm release:check` numbers reported in the wave's landing commit.
- Desktop/phone verification: same constraint as wave 5 —
  `EmulateMobile` never enabled (kills Node-based plugins); phone
  hover-gate correctness is verified by reading the resulting CSS
  (`@media (hover: hover)` wrapper present, no reveal-only pattern
  stranded behind it) against the kit's phone column. Phone sign-off
  remains Mario's, on-device.
