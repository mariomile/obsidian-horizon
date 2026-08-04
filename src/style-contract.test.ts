import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * mv-kit style contract (obsidian-cosmos-theme/docs/mv-kit.md).
 *
 * Ported from obsidian-sonar's vitest version (commit 3acb417) to this
 * repo's node:test runner, keeping all four assertions verbatim in intent —
 * same as the sonar/portal/masonry/tabx lineage. Encodes only the state
 * landed by the wave-5 mv-kit audit (previous commit) — not aspirational
 * rules the audit didn't actually fix. See docs/2026-07-mv-kit-audit.md for
 * the full per-rule verdict.
 */

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

/** Strip comments so `/* 80ms *\/`-style prose in doc comments doesn't
 * trip the raw-value scan below. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('mv-kit style contract', () => {
  // Regression guard (mv-kit.md's own MUST NOT, ~lines 23-33): a comment
  // written as `--cosmos-*` immediately followed by a slash terminates the
  // comment early. Everything after it parses as garbage and the browser
  // DROPS the enclosing rule — this cost Sonar its `.sonar-modal { width:
  // 880px }` in the 2026-07 audit wave (af28344). Invisible to eslint/tsc/
  // node:test and to the raw-value scan below, so it gets its own assertion.
  it('no CSS comment terminates early (token glob followed by a slash)', () => {
    const offenders = css
      .split('\n')
      .map((line, idx) => ({ line: line.trim(), n: idx + 1 }))
      .filter(({ line }) => /--[\w-]*\*\//.test(line));

    assert.deepEqual(offenders, []);
  });

  it('stripping comments leaves no orphaned prose (structural parse check)', () => {
    // If a comment closed early, its remaining lines survive the strip as
    // stray ` * ...` prose sitting in declaration position.
    const orphans = stripComments(css)
      .split('\n')
      .map((line, idx) => ({ line: line.trim(), n: idx + 1 }))
      .filter(({ line }) => /^\*\s|^\*$/.test(line));

    assert.deepEqual(orphans, []);
  });

  it('raw ms/hex/cubic-bezier values appear only as var() fallbacks', () => {
    const code = stripComments(css);
    const lines = code.split('\n');

    // A raw ms/hex/cubic-bezier is allowed ONLY when it sits inside a
    // `var(--cosmos-*, <fallback>)` or `var(--mv-*, <fallback>)` expression —
    // i.e. the line contains `var(--cosmos-` or `var(--mv-` before the raw
    // value. This is a line-level heuristic (matches the audit procedure in
    // mv-kit.md §"Audit procedure": grep for raw values outside a var()
    // fallback), not a full CSS parse.
    const rawMsPattern = /\b\d+ms\b/g;
    const rawHexPattern = /#[0-9a-fA-F]{3,8}\b/g;
    const rawCubicBezierPattern = /cubic-bezier\([^)]*\)/g;

    const violations: string[] = [];

    lines.forEach((line, idx) => {
      // A raw value is allowed when it sits as the fallback inside ANY
      // var(--token, <fallback>) expression (native Obsidian tokens like
      // --color-red-rgb included) — the contract's requirement is "never a
      // bare value", not "only --cosmos-*/--mv-* tokens may have fallbacks".
      const hasVarFallback = /var\(\s*--[\w-]+\s*,/.test(line);
      // Unica eccezione: la deroga standard `transition-duration: 0.01ms` di
      // prefers-reduced-motion. Non è un valore da tokenizzare — è il modo
      // canonico di azzerare una transizione lasciando che gli eventi
      // transitionend continuino a scattare. Stessa eccezione già codificata
      // nel contratto di masonry; qui mancava solo perché il caso non si era
      // mai presentato prima del blocco mv-seg vendored dal kit.
      const reducedMotionCarveOut = /^\s*transition-duration:\s*0\.01ms;\s*$/.test(line);

      for (const pattern of [rawMsPattern, rawHexPattern, rawCubicBezierPattern]) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(line)) !== null) {
          if (!hasVarFallback && !reducedMotionCarveOut) {
            violations.push(`line ${idx + 1}: "${match[0]}" in "${line.trim()}"`);
          }
        }
      }
    });

    assert.deepEqual(violations, []);
  });

  it('caps !important declarations at the post-mv-kit-audit count (ratchet down only)', () => {
    const importantCount = (css.match(/!important;/g) ?? []).length;
    // Ceiling set exactly at the post-fix count landed by the wave-5 mv-kit
    // audit (2026-07): the drop-target highlight (.horizon-drop, 2), the
    // journal height override (.horizon-journal, 1), and the focus-ring
    // preservation block (.horizon-* :focus-visible, 2) — all pre-existing,
    // documented, necessary specificity overrides untouched by this wave's
    // fixes. Any new edit that adds an !important without removing one
    // fails this test — the ceiling can only ratchet down.
    assert.ok(
      importantCount <= 5,
      `!important count ${importantCount} exceeds the frozen ceiling of 5`,
    );
  });

  // mv-kit §6 (2026-07 dynamics wave, obsidian-cosmos-theme commit 10f5ddc):
  // every `:hover` selector must be gated behind `@media (hover: hover)` —
  // Horizon's calendar cells, chips, and buttons are all phone-reachable
  // (the whole calendar view renders full-width on a phone), and a bare
  // `:hover` rule leaves a stuck hover wash after a tap on touch browsers
  // (no pointer-leave event to clear it). `:focus-visible` is exempt
  // (keyboard-only, must never be hover-gated). Brace-depth tracking (not
  // line-shape guessing), ported verbatim from obsidian-portal's wave-2 §6
  // assertion (commit 133c93d): each open `@media` records the CSS nesting
  // depth it was opened at plus whether it is a hover:hover query; it's
  // only popped when depth unwinds back to that level, so a rule block's
  // own closing `}` inside the @media doesn't falsely pop the @media itself.
  it('every :hover selector is gated behind @media (hover: hover)', () => {
    const lines = stripComments(css).split('\n');
    const violations: string[] = [];

    let depth = 0;
    const mediaStack: { openedAtDepth: number; isHoverGate: boolean }[] = [];

    lines.forEach((rawLine, idx) => {
      const line = rawLine.trim();
      const mediaOpen = /^@media\s*\(([^)]*)\)\s*\{/.exec(line);
      if (mediaOpen) {
        mediaStack.push({ openedAtDepth: depth, isHoverGate: /hover:\s*hover/.test(mediaOpen[1] ?? '') });
      }

      if (/:hover\b/.test(line)) {
        const insideHoverGate = mediaStack.some((m) => m.isHoverGate);
        if (!insideHoverGate) {
          violations.push(`line ${idx + 1}: "${line}"`);
        }
      }

      const opens = (line.match(/\{/g) ?? []).length;
      const closes = (line.match(/\}/g) ?? []).length;
      depth += opens - closes;

      let top = mediaStack.at(-1);
      while (top !== undefined && depth <= top.openedAtDepth) {
        mediaStack.pop();
        top = mediaStack.at(-1);
      }
    });

    assert.deepEqual(violations, []);
  });

  // mv-kit §6: hover richness on a card-shaped surface is colour AND a
  // subtle physical lift, never colour alone — the kit's own code example
  // pairs `.card:hover` with a `transform: translateY(-1px)` lift alongside
  // any colour/shadow richness. `.horizon-chip--card` (note mini-card) and
  // `.horizon-journal__card` (journal entry card) are Horizon's only two
  // card-shaped (rounded, bordered, elevated) hover surfaces — both had
  // border-color/box-shadow richness but no transform, same pre-fix gap
  // TabX's wave found on `.tabx-card:hover` (commit cc65cd4). List/row
  // surfaces (`.horizon-chip`, `.horizon-cal__weeknum`, etc.) are
  // deliberately excluded — the kit's own example treats row=colour-only
  // and card=lift as two distinct patterns, not one rule both must satisfy
  // (see docs/2026-07-mv-kit-audit.md §6 "Hover richness" for the full
  // row-vs-card reasoning, carried over from obsidian-portal's wave-2 §6).
  it('card-shaped hover surfaces pair colour richness with a lift transform', () => {
    const cardHoverSelectors = ['.horizon-chip--card:hover', '.horizon-journal__card:hover'];
    const code = stripComments(css);

    for (const selector of cardHoverSelectors) {
      const escaped = selector.replace(/[.#]/g, '\\$&');
      const ruleMatch = new RegExp(`${escaped}[^{]*\\{([^}]*)\\}`).exec(code);
      assert.ok(ruleMatch, `rule block for ${selector} not found`);
      const body = ruleMatch[1] ?? '';
      assert.match(
        body,
        /transform:\s*translateY\(-(0\.5|1|1\.5|2)px\)/,
        `${selector} is missing a ≤2px translateY lift`,
      );
    }
  });
});
