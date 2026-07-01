import { PluginSettingTab, Setting, type App } from 'obsidian';

import type HorizonPlugin from './main.ts';
import { PERIODS } from './settings.ts';
import type { Period } from './types.ts';

const PERIOD_LABELS: Record<Period, string> = {
  daily: 'Note giornaliere',
  weekly: 'Note settimanali',
  monthly: 'Note mensili',
  yearly: 'Note annuali',
};

export class HorizonSettingTab extends PluginSettingTab {
  private readonly plugin: HorizonPlugin;

  constructor(app: App, plugin: HorizonPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Horizon' });
    containerEl.createEl('p', {
      text: 'Calendario del vault: note periodiche, tasks con date e note datate.',
    });

    for (const period of PERIODS) {
      this.periodSection(period);
    }

    containerEl.createEl('h3', { text: 'Vista' });

    new Setting(containerEl)
      .setName('Giorni in agenda')
      .setDesc('Quanti giorni futuri mostra la vista Agenda.')
      .addSlider((slider) =>
        slider
          .setLimits(7, 60, 1)
          .setDynamicTooltip()
          .setValue(this.plugin.settings.agendaHorizonDays)
          .onChange(async (value) => {
            this.plugin.settings.agendaHorizonDays = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Numeri di settimana')
      .setDesc('Mostra la colonna con i numeri di settimana ISO.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showWeekNumbers).onChange(async (value) => {
          this.plugin.settings.showWeekNumbers = value;
          await this.plugin.saveSettings();
        }),
      );

    const visibility: Array<{ key: 'showDue' | 'showScheduled' | 'showDone' | 'showNotes'; name: string; desc: string }> = [
      { key: 'showDue', name: 'Tasks in scadenza', desc: 'Mostra i tasks con data 📅 due.' },
      { key: 'showScheduled', name: 'Tasks pianificati', desc: 'Mostra i tasks con data ⏳ scheduled.' },
      { key: 'showDone', name: 'Tasks completati', desc: 'Mostra i tasks con data ✅ done.' },
      { key: 'showNotes', name: 'Note datate', desc: 'Mostra le note con proprietà `date` nel frontmatter.' },
    ];
    for (const item of visibility) {
      new Setting(containerEl)
        .setName(item.name)
        .setDesc(item.desc)
        .addToggle((toggle) =>
          toggle.setValue(this.plugin.settings[item.key]).onChange(async (value) => {
            this.plugin.settings[item.key] = value;
            await this.plugin.saveSettings();
          }),
        );
    }

    new Setting(containerEl)
      .setName('Conferma prima di creare')
      .setDesc('Chiedi conferma prima di creare una nuova nota periodica.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.confirmBeforeCreate).onChange(async (value) => {
          this.plugin.settings.confirmBeforeCreate = value;
          await this.plugin.saveSettings();
        }),
      );
  }

  private periodSection(period: Period): void {
    const { containerEl } = this;
    const config = this.plugin.settings.periods[period];
    containerEl.createEl('h3', { text: PERIOD_LABELS[period] });

    new Setting(containerEl)
      .setName('Attiva')
      .setDesc('Includi questo periodo nel calendario.')
      .addToggle((toggle) =>
        toggle.setValue(config.enabled).onChange(async (value) => {
          config.enabled = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('Cartella')
      .addText((text) =>
        text
          .setPlaceholder('Journal/Daily')
          .setValue(config.folder)
          .onChange(async (value) => {
            config.folder = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Formato')
      .setDesc('Formato moment del nome file (es. DD-MM-YYYY, GGGG-[W]WW).')
      .addText((text) =>
        text
          .setPlaceholder('DD-MM-YYYY')
          .setValue(config.format)
          .onChange(async (value) => {
            config.format = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Template')
      .setDesc('Percorso del template per le nuove note (opzionale).')
      .addText((text) =>
        text
          .setPlaceholder('_system/templates/Daily-Note')
          .setValue(config.template)
          .onChange(async (value) => {
            config.template = value.trim();
            await this.plugin.saveSettings();
          }),
      );
  }
}
