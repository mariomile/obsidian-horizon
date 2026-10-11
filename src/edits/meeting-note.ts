import { Notice, normalizePath, TFile } from 'obsidian';
import type { PaneType } from 'obsidian';

import type { CalEvent } from '../gcal/events.ts';
import type { HorizonContext } from '../ui/context.ts';
import { dateToBasename } from '../index/periodic.ts';
import { localDayOf, meetingBasename, sameTitle } from './meeting-match.ts';
import { applyTemplate } from './template.ts';

/**
 * The note already tied to `event`: one created by Horizon (`gcal_event`), or
 * a Granola note with the same title on the same local day.
 */
export function findMeetingNote(ctx: HorizonContext, event: CalEvent): TFile | null {
  let granolaMatch: TFile | null = null;
  for (const file of ctx.app.vault.getMarkdownFiles()) {
    const fm = ctx.app.metadataCache.getFileCache(file)?.frontmatter;
    if (!fm) continue;
    if (fm.gcal_event === event.id) return file;
    if (
      granolaMatch === null &&
      typeof fm.granola_id === 'string' &&
      typeof fm.title === 'string' &&
      sameTitle(fm.title, event.title) &&
      localDayOf(fm.created) === event.startDay
    ) {
      granolaMatch = file;
    }
  }
  return granolaMatch;
}

async function templateBody(ctx: HorizonContext, event: CalEvent, title: string): Promise<string> {
  const templatePath = ctx.settings.google.meetingTemplate;
  if (templatePath === '') return `# ${event.title}\n`;
  const file =
    ctx.app.vault.getFileByPath(templatePath) ??
    ctx.app.vault.getFileByPath(`${templatePath}.md`) ??
    ctx.app.metadataCache.getFirstLinkpathDest(templatePath, '');
  if (!file) {
    new Notice(`Horizon: template "${templatePath}" not found, creating a plain note.`);
    return `# ${event.title}\n`;
  }
  const source = await ctx.app.vault.cachedRead(file);
  return applyTemplate(source, ctx.moment, event.startDay, title, () => event.startTime ?? '');
}

/**
 * Create the meeting note for `event`: template body, then the properties
 * that tie it to the event and to the day's daily note.
 */
export async function createMeetingNote(ctx: HorizonContext, event: CalEvent): Promise<TFile | null> {
  const folder = normalizePath(ctx.settings.google.meetingFolder.replace(/\/+$/, '') || '/');
  const pathFor = (name: string): string =>
    normalizePath(folder === '/' ? `${name}.md` : `${folder}/${name}.md`);
  let basename = meetingBasename(event);
  const existing = ctx.app.vault.getAbstractFileByPath(pathFor(basename));
  if (existing instanceof TFile) {
    const owner: unknown = ctx.app.metadataCache.getFileCache(existing)?.frontmatter?.gcal_event;
    if (owner === event.id) return existing;
    // Same title, same day, different meeting (two standups): tell them apart.
    basename = meetingBasename(event, true);
    if (ctx.app.vault.getAbstractFileByPath(pathFor(basename))) basename = `${basename} ${event.id.slice(0, 6)}`;
  }
  const path = pathFor(basename);
  try {
    if (folder !== '/' && !ctx.app.vault.getFolderByPath(folder)) {
      await ctx.app.vault.createFolder(folder);
    }
    const file = await ctx.app.vault.create(path, await templateBody(ctx, event, basename));
    const daily = ctx.settings.periods.daily;
    await ctx.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
      fm.date = event.startTime ? `${event.startDay}T${event.startTime}` : event.startDay;
      fm.gcal_event = event.id;
      if (daily.enabled) {
        fm.daily = `[[${dateToBasename(ctx.moment, event.startDay, daily.format)}]]`;
      }
    });
    return file;
  } catch (error) {
    console.error('Horizon: meeting note creation failed', error);
    new Notice(`Horizon: could not create "${basename}".`);
    return null;
  }
}

export async function openMeetingNote(
  ctx: HorizonContext,
  event: CalEvent,
  paneType: PaneType | boolean,
): Promise<void> {
  const file = findMeetingNote(ctx, event) ?? (await createMeetingNote(ctx, event));
  if (!file) return;
  const leaf = ctx.app.workspace.getLeaf(paneType === true ? 'tab' : paneType || undefined);
  await leaf.openFile(file);
}
