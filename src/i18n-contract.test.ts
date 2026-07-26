import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * i18n contract: Horizon's user-facing strings (ribbon/commands, settings
 * tab, Notices, chip/button labels) must be English — mv-kit §5 "Microcopy
 * voice" (obsidian-cosmos-theme/docs/mv-kit.md, lines 181-192). This guards
 * against Italian regressions creeping back into src/**\/*.ts.
 *
 * Scope mirrors what a plugin user actually reads: arguments to
 * setName/setDesc/setPlaceholder/setTooltip, `new Notice(...)` messages, and
 * string values of object-literal properties named name/title/description/
 * label/text (command definitions, chip specs, preset menus, etc). Test
 * fixtures and code comments are out of scope by design (see below).
 */

const SRC_DIR = fileURLToPath(new URL('.', import.meta.url));

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...collectSourceFiles(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      files.push(full);
    }
  }
  return files;
}

/** Strip // line comments and /* block comments *\/ so comment prose never counts as a user-facing string. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

// Word-boundary aware; \b doesn't span accented chars in JS regex, so accented
// forms are listed explicitly alongside their plain-ASCII equivalent.
const ITALIAN_FUNCTION_WORDS = [
  'il', 'lo', 'la', 'gli', 'le', 'del', 'della', 'dei', 'delle', 'nel', 'nella',
  'con', 'che', 'non', 'piu', 'più', 'gia', 'già', 'quando', 'dove', 'questo',
  'questa', 'viene', 'vengono', 'puoi', 'serve', 'apri', 'chiudi', 'mostra',
  'nascondi', 'elimina', 'salva', 'seleziona', 'aggiorna', 'nessun', 'perche',
  'perché', 'cosi', 'così',
];

const WORD_RE = new RegExp(
  `\\b(${ITALIAN_FUNCTION_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'giu',
);

function countItalianFunctionWords(text: string): number {
  const matches = text.match(WORD_RE);
  return matches ? matches.length : 0;
}

/** A quoted string literal: '...', "...", or `...` (no interpolation parsing needed — we just need the raw text). */
const STRING_LITERAL = String.raw`'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|\`(?:[^\`\\]|\\.)*\``;

function unquote(literal: string): string {
  return literal.slice(1, -1);
}

/** Extract user-facing strings per the contract's scope from one (comment-stripped) source file. */
function extractUserFacingStrings(source: string): string[] {
  const found: string[] = [];

  // 1. Arguments to setName/setDesc/setPlaceholder/setTooltip(...) and new Notice(...).
  const callRe = new RegExp(
    `\\b(?:setName|setDesc|setPlaceholder|setTooltip|Notice)\\s*\\(\\s*(${STRING_LITERAL})`,
    'g',
  );
  for (const match of source.matchAll(callRe)) {
    if (match[1]) found.push(unquote(match[1]));
  }

  // 2. String values of object-literal properties named name|title|description|label|text.
  //    Matches `name: '...'`, `title: "..."`, etc. — including inside array/object
  //    literals (command defs, chip specs, preset menus, visibility toggles).
  const propRe = new RegExp(
    `\\b(?:name|title|description|label|text)\\s*:\\s*(${STRING_LITERAL})`,
    'g',
  );
  for (const match of source.matchAll(propRe)) {
    if (match[1]) found.push(unquote(match[1]));
  }

  return found;
}

describe('i18n contract — no Italian in user-facing strings', () => {
  it('setName/setDesc/setPlaceholder/setTooltip/Notice/name/title/description/label/text carry no Italian', () => {
    const files = collectSourceFiles(SRC_DIR).sort();
    assert.ok(files.length > 0, 'expected to find source files under src/');

    const violations: string[] = [];
    let totalItalianHits = 0;

    for (const file of files) {
      const raw = readFileSync(file, 'utf8');
      const stripped = stripComments(raw);
      const strings = extractUserFacingStrings(stripped);
      for (const str of strings) {
        const hits = countItalianFunctionWords(str);
        if (hits >= 2) {
          totalItalianHits += 1;
          violations.push(`${file.replace(SRC_DIR, 'src/')}: "${str}" (${hits} Italian function words)`);
        }
      }
    }

    assert.deepEqual(
      violations,
      [],
      `found ${totalItalianHits} user-facing string(s) with Italian:\n${violations.join('\n')}`,
    );
  });
});
