import type { App, TAbstractFile, TFile } from 'obsidian';
import { createScanText, normalizeCoverCandidate } from './kit/mdpreview.ts';

// Markdown-preview primitives shared with masonry via marioverse-kit
// (vendored in src/kit/mdpreview.ts). stripFrontmatter is re-exported for
// journal.ts without a local import (it is not used directly in this module).
export { createScanText, normalizeCoverCandidate, stripFrontmatter } from './kit/mdpreview.ts';

const IMAGE_EXTENSIONS = new Set(['avif', 'bmp', 'gif', 'jpeg', 'jpg', 'png', 'svg', 'webp']);

/** Runtime-import-free stand-in for `instanceof TFile` (keeps this module node-testable). */
function isImageFile(value: TAbstractFile | null): value is TFile {
  return (
    value !== null &&
    'extension' in value &&
    IMAGE_EXTENSIONS.has((value as TFile).extension.toLocaleLowerCase())
  );
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
