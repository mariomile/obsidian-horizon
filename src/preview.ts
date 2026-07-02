import type { App, TAbstractFile, TFile } from 'obsidian';

// Scan-text and cover logic ported from the sibling masonry plugin
// (masonry/src/utils.ts, presentation.ts, preview.ts) — keep in sync manually.

const IMAGE_EXTENSIONS = new Set(['avif', 'bmp', 'gif', 'jpeg', 'jpg', 'png', 'svg', 'webp']);

/** Runtime-import-free stand-in for `instanceof TFile` (keeps this module node-testable). */
function isImageFile(value: TAbstractFile | null): value is TFile {
  return (
    value !== null &&
    'extension' in value &&
    IMAGE_EXTENSIONS.has((value as TFile).extension.toLocaleLowerCase())
  );
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase();
}

export function stripFrontmatter(markdown: string): string {
  if (!markdown.startsWith('---')) return markdown;
  return markdown.replace(/^---\s*\n[\s\S]*?\n---\s*(?:\n|$)/, '');
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

export interface NotePreview {
  imageUrl: string | null;
  excerpt: string;
}

/**
 * Excerpt + first cover image for a note, LRU-cached by path:mtime:chars.
 * Image precedence: frontmatter cover/image/thumbnail → first image embed →
 * first external markdown image.
 */
export class NotePreviewService {
  private readonly app: App;
  private readonly maxCacheEntries: number;
  private readonly cache = new Map<string, NotePreview>();

  constructor(app: App, maxCacheEntries = 320) {
    this.app = app;
    this.maxCacheEntries = maxCacheEntries;
  }

  async getPreview(file: TFile, maxCharacters: number): Promise<NotePreview> {
    const cacheKey = `${file.path}:${file.stat.mtime}:${maxCharacters}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.cache.delete(cacheKey);
      this.cache.set(cacheKey, cached);
      return cached;
    }

    const source = await this.app.vault.cachedRead(file);
    const preview: NotePreview = {
      imageUrl: this.findImageUrl(file, source),
      excerpt: createScanText(source, file.basename, maxCharacters),
    };
    this.cache.set(cacheKey, preview);
    this.prune();
    return preview;
  }

  invalidate(path?: string): void {
    if (!path) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${path}:`)) this.cache.delete(key);
    }
  }

  private findImageUrl(file: TFile, source: string): string | null {
    const cache = this.app.metadataCache.getFileCache(file);

    for (const property of ['cover', 'image', 'thumbnail'] as const) {
      const candidate = normalizeCoverCandidate(cache?.frontmatter?.[property]);
      if (!candidate) continue;
      const resolved = this.resolveImageCandidate(candidate, file.path);
      if (resolved) return resolved;
    }

    for (const embed of cache?.embeds ?? []) {
      const destination = this.app.metadataCache.getFirstLinkpathDest(embed.link, file.path);
      if (isImageFile(destination)) {
        return this.app.vault.getResourcePath(destination);
      }
    }

    const external = source.match(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)(?:\s+["'][^"']*["'])?\)/i);
    return external?.[1] ?? null;
  }

  private resolveImageCandidate(candidate: string, sourcePath: string): string | null {
    if (/^https?:\/\//i.test(candidate)) return candidate;
    const destination = this.app.metadataCache.getFirstLinkpathDest(candidate, sourcePath);
    return isImageFile(destination) ? this.app.vault.getResourcePath(destination) : null;
  }

  private prune(): void {
    while (this.cache.size > this.maxCacheEntries) {
      const oldestKey = this.cache.keys().next().value as string | undefined;
      if (!oldestKey) return;
      this.cache.delete(oldestKey);
    }
  }
}
