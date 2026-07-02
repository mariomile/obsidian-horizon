import { Modal, Notice, type App, type PaneType, type TFile } from 'obsidian';

import { dateToBasename } from '../index/periodic.ts';
import type { DayKey, Period } from '../types.ts';
import type { HorizonContext } from '../ui/context.ts';
import { applyTemplate } from './template.ts';

const PERIOD_LABEL: Record<Period, string> = {
  daily: 'giornaliera',
  weekly: 'settimanale',
  monthly: 'mensile',
  yearly: 'annuale',
};

class ConfirmCreateModal extends Modal {
  private readonly message: string;
  private readonly resolve: (confirmed: boolean) => void;
  private confirmed = false;

  constructor(app: App, message: string, resolve: (confirmed: boolean) => void) {
    super(app);
    this.message = message;
    this.resolve = resolve;
  }

  onOpen(): void {
    this.titleEl.setText('Horizon');
    this.contentEl.createEl('p', { text: this.message });
    const buttons = this.contentEl.createDiv({ cls: 'modal-button-container' });
    const create = buttons.createEl('button', { cls: 'mod-cta', text: 'Crea' });
    create.addEventListener('click', () => {
      this.confirmed = true;
      this.close();
    });
    const cancel = buttons.createEl('button', { text: 'Annulla' });
    cancel.addEventListener('click', () => this.close());
  }

  onClose(): void {
    this.contentEl.empty();
    this.resolve(this.confirmed);
  }
}

function confirmCreate(app: App, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    new ConfirmCreateModal(app, message, resolve).open();
  });
}

async function templateContent(
  ctx: HorizonContext,
  templatePath: string,
  key: DayKey,
  title: string,
): Promise<string> {
  if (templatePath === '') return '';
  const file =
    ctx.app.vault.getFileByPath(templatePath) ??
    ctx.app.vault.getFileByPath(`${templatePath}.md`) ??
    ctx.app.metadataCache.getFirstLinkpathDest(templatePath, '');
  if (!file) {
    new Notice(`Horizon: template "${templatePath}" non trovato — creo una nota vuota.`);
    return '';
  }
  const source = await ctx.app.vault.cachedRead(file);
  // Local wall-clock time for {{time}} tokens — toISOString() would drift to UTC.
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  const localNow = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const now = ctx.moment(localNow, 'YYYY-MM-DDTHH:mm:ss', true);
  return applyTemplate(source, ctx.moment, key, title, (fmt) => now.format(fmt));
}

async function ensureFolder(app: App, folder: string): Promise<void> {
  if (folder === '' || app.vault.getFolderByPath(folder)) return;
  await app.vault.createFolder(folder);
}

/** Get-or-create the periodic note for `key`, without opening or confirming. */
export async function ensurePeriodicNote(
  ctx: HorizonContext,
  period: Period,
  key: DayKey,
): Promise<TFile | null> {
  const config = ctx.settings.periods[period];
  if (!config.enabled) return null;
  const existing = ctx.periodic.noteFor(period, key);
  if (existing) return existing;
  const basename = dateToBasename(ctx.moment, key, config.format);
  try {
    await ensureFolder(ctx.app, config.folder.replace(/\/+$/, ''));
    const content = await templateContent(ctx, config.template, key, basename);
    return await ctx.app.vault.create(ctx.periodic.pathFor(period, key), content);
  } catch (error) {
    console.error('Horizon: creazione nota fallita', error);
    return null;
  }
}

/**
 * Open the periodic note for `key`, creating it from the configured template
 * when missing (with optional confirmation).
 */
export async function openPeriodicNote(
  ctx: HorizonContext,
  period: Period,
  key: DayKey,
  paneType: PaneType | boolean,
): Promise<void> {
  const config = ctx.settings.periods[period];
  if (!config.enabled) {
    new Notice(`Horizon: le note ${PERIOD_LABEL[period]} sono disattivate nelle impostazioni.`);
    return;
  }
  const existing = ctx.periodic.noteFor(period, key);
  if (existing) {
    await openFile(ctx, existing, paneType);
    return;
  }

  const basename = dateToBasename(ctx.moment, key, config.format);
  if (ctx.settings.confirmBeforeCreate) {
    const ok = await confirmCreate(
      ctx.app,
      `Creare la nota ${PERIOD_LABEL[period]} "${basename}"?`,
    );
    if (!ok) return;
  }

  const file = await ensurePeriodicNote(ctx, period, key);
  if (file) {
    await openFile(ctx, file, paneType);
  } else {
    new Notice(`Horizon: impossibile creare "${basename}".`);
  }
}

async function openFile(
  ctx: HorizonContext,
  file: TFile,
  paneType: PaneType | boolean,
): Promise<void> {
  const leaf = ctx.app.workspace.getLeaf(paneType === true ? 'tab' : paneType || undefined);
  await leaf.openFile(file);
}
