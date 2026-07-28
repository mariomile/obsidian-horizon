// ⚠️ VENDORED da marioverse-kit/mdpreview.ts — sorgente canonica lì.
// Non editare qui: modifica il canonico e rilancia marioverse-kit/sync.sh.
// marioverse-kit · mdpreview — canonical source of truth.
//
// Markdown-preview primitives shared verbatim by the plugins that render note
// cards (Masonry, Horizon). These were copies kept in sync by a hand comment
// ("keep in sync manually") — exactly the drift the kit removes.
//
// `createScanText` had SILENTLY DRIFTED between the two copies: masonry stripped
// the list marker BEFORE the task checkbox, leaving "[ ] " litter in task-line
// previews; horizon stripped the checkbox first (correct). This module adopts
// horizon's correct order — consolidating here fixes that latent masonry bug.
//
// Consumers vendor a copy at `src/kit/mdpreview.ts` via `sync.sh`. Edit HERE.

export function stripFrontmatter(markdown: string): string {
  if (!markdown.startsWith('---')) return markdown;
  return markdown.replace(/^---\s*\n[\s\S]*?\n---\s*(?:\n|$)/, '');
}

/** Accent- and case-folded form, for locale-stable equality checks. */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase();
}

/** Clean prose excerpt: frontmatter, code, embeds, tables, HTML, list markers out. */
export function createScanText(markdown: string, title: string, maxCharacters: number): string {
  const withoutStructure = stripFrontmatter(markdown)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[\[[^\]]+\]\]/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target, label) =>
      String(label ?? target).trim(),
    )
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#\s+.*$/m, (heading) => {
      const headingTitle = heading.replace(/^#\s+/, '').trim();
      return normalizeText(headingTitle) === normalizeText(title) ? ' ' : headingTitle;
    })
    .replace(/^\s*>\s*\[![^\]]+\]\s*/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/gm, ' ')
    .replace(/\|/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    // Checkbox before the bare list marker: "- [ ] foo" → "foo", not "[ ] foo".
    .replace(/^\s*- \[[ xX]\]\s*/gm, '')
    .replace(/^\s*(?:[-*+] |\d+[.)] )/gm, '')
    .replace(/[`*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (withoutStructure.length <= maxCharacters) return withoutStructure;
  const candidate = withoutStructure.slice(0, maxCharacters + 1);
  const wordBreak = candidate.lastIndexOf(' ');
  const end = wordBreak >= Math.floor(maxCharacters * 0.6) ? wordBreak : maxCharacters;
  return `${candidate.slice(0, end).trim()}…`;
}

/** Frontmatter cover value → link target or URL (wikilink/markdown-image/plain forms). */
export function normalizeCoverCandidate(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const candidate of value) {
      const normalized = normalizeCoverCandidate(candidate);
      if (normalized) return normalized;
    }
    return undefined;
  }
  if (typeof value !== 'string') return undefined;

  const candidate = value.trim();
  if (!candidate) return undefined;

  const wikilink = candidate.match(/^!?(?:\[\[)([^\]]+)(?:\]\])$/);
  if (wikilink?.[1]) return wikilink[1].split('|')[0]?.trim() || undefined;

  const markdownImage = candidate.match(/^!\[[^\]]*\]\(([^)]+)\)$/);
  if (markdownImage?.[1]) {
    return markdownImage[1].replace(/\s+["'][^"']*["']$/, '').trim();
  }

  return candidate.replace(/^['"]|['"]$/g, '').trim() || undefined;
}
