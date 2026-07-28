// ⚠️ VENDORED da marioverse-kit/mdpreview.ts — sorgente canonica lì.
// Non editare qui: modifica il canonico e rilancia marioverse-kit/sync.sh.
// marioverse-kit · mdpreview — canonical source of truth.
//
// Markdown-preview primitives shared verbatim by the plugins that render note
// cards (Masonry, Horizon). These two were byte-identical copies kept in sync by
// a hand comment ("keep in sync manually") — exactly the drift the kit removes.
//
// NOTE: `createScanText` (the prose-excerpt builder) also lived in both copies
// but had SILENTLY DRIFTED (masonry strips the list marker before the task
// checkbox, leaving "[ ] " litter in task-line previews; horizon strips the
// checkbox first, correctly). It is intentionally NOT here yet — unifying it is a
// behaviour change that needs its own test adjudication. See marioverse-kit README.
//
// Consumers vendor a copy at `src/kit/mdpreview.ts` via `sync.sh`. Edit HERE.

export function stripFrontmatter(markdown: string): string {
  if (!markdown.startsWith('---')) return markdown;
  return markdown.replace(/^---\s*\n[\s\S]*?\n---\s*(?:\n|$)/, '');
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
