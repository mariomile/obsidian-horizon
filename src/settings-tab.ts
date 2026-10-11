import { Notice, Platform, PluginSettingTab, SecretComponent, Setting, type App } from 'obsidian';

import type HorizonPlugin from './main.ts';
import { PERIODS } from './settings.ts';
import type { Period } from './types.ts';

const PERIOD_LABELS: Record<Period, string> = {
  daily: 'Daily notes',
  weekly: 'Weekly notes',
  monthly: 'Monthly notes',
  yearly: 'Yearly notes',
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
    containerEl.createEl('p', {
      text: 'Calendar for your vault: periodic notes, tasks with dates, and dated notes.',
    });

    for (const period of PERIODS) {
      this.periodSection(period);
    }

    this.googleSection();

    new Setting(containerEl).setName('View').setHeading();

    new Setting(containerEl)
      .setName('Days in agenda')
      .setDesc('How many future days the Agenda view shows.')
      .addSlider((slider) =>
        slider
          .setLimits(7, 60, 1)
          .setValue(this.plugin.settings.agendaHorizonDays)
          .onChange(async (value) => {
            this.plugin.settings.agendaHorizonDays = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Week numbers')
      .setDesc('Show the column with ISO week numbers.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showWeekNumbers).onChange(async (value) => {
          this.plugin.settings.showWeekNumbers = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('Date bar in daily notes')
      .setDesc('Show the ‹ date › picker in the header of daily notes.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.daybar).onChange(async (value) => {
          this.plugin.settings.daybar = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('Week note preview')
      .setDesc('Show a preview card of the week note under the sidebar mini-calendar.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.weekNotePreview).onChange(async (value) => {
          this.plugin.settings.weekNotePreview = value;
          await this.plugin.saveSettings();
        }),
      );

    const visibility: Array<{ key: 'showDue' | 'showScheduled' | 'showDone' | 'showNotes'; name: string; desc: string }> = [
      { key: 'showDue', name: 'Due tasks', desc: 'Show tasks with a 📅 due date.' },
      { key: 'showScheduled', name: 'Scheduled tasks', desc: 'Show tasks with a ⏳ scheduled date.' },
      { key: 'showDone', name: 'Done tasks', desc: 'Show tasks with a ✅ done date.' },
      { key: 'showNotes', name: 'Dated notes', desc: 'Show notes with a `date` property in frontmatter.' },
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

    new Setting(containerEl).setName('Previews').setHeading();

    new Setting(containerEl)
      .setName('Mini-cards with preview')
      .setDesc('Notes in Agenda, Week, popovers, and Bases views show an excerpt and image.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.richCards).onChange(async (value) => {
          this.plugin.settings.richCards = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('Preview length')
      .setDesc('Characters of text per card (the hover-card uses double this).')
      .addSlider((slider) =>
        slider
          .setLimits(100, 600, 20)
          .setValue(this.plugin.settings.previewCharacters)
          .onChange(async (value) => {
            this.plugin.settings.previewCharacters = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl).setName('Agents').setHeading();

    new Setting(containerEl)
      .setName('Export agenda for agents')
      .setDesc('Periodically writes a JSON with agenda and overdue tasks, readable by skills and agents.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.agentExport.enabled).onChange(async (value) => {
          this.plugin.settings.agentExport.enabled = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('Agenda export path')
      .addText((text) =>
        text
          .setPlaceholder('.horizon/agenda.json')
          .setValue(this.plugin.settings.agentExport.path)
          .onChange(async (value) => {
            this.plugin.settings.agentExport.path = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Agent proposals path')
      .setDesc('JSON file where agents propose tasks and moves (ghost chips).')
      .addText((text) =>
        text
          .setPlaceholder('.horizon/proposals.json')
          .setValue(this.plugin.settings.proposalsPath)
          .onChange(async (value) => {
            this.plugin.settings.proposalsPath = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Confirm before creating')
      .setDesc('Ask for confirmation before creating a new periodic note.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.confirmBeforeCreate).onChange(async (value) => {
          this.plugin.settings.confirmBeforeCreate = value;
          await this.plugin.saveSettings();
        }),
      );
  }

  private googleSection(): void {
    const { containerEl } = this;
    const google = this.plugin.settings.google;
    const gcal = this.plugin.gcal;
    const save = async (reload = false): Promise<void> => {
      await this.plugin.saveSettings();
      if (reload) gcal.reload();
    };

    new Setting(containerEl).setName('Google Calendar').setHeading();
    containerEl.createEl('p', {
      cls: 'setting-item-description',
      text:
        'Read-only. Uses your own Google Cloud OAuth client of type "Desktop app" with the Calendar API enabled. ' +
        'Publish the consent screen to production: in testing mode Google expires the sign-in every 7 days. ' +
        'The sign-in token stays on this device and is never written to the vault.',
    });

    new Setting(containerEl)
      .setName('Client ID')
      .addText((text) =>
        text
          .setPlaceholder('1234-abc.apps.googleusercontent.com')
          .setValue(google.clientId)
          .onChange(async (value) => {
            google.clientId = value.trim();
            await save();
          }),
      );

    new Setting(containerEl)
      .setName('Client secret')
      .setDesc('Stored in Obsidian secret storage. Pick an existing secret or create one.')
      .addComponent((el) =>
        new SecretComponent(this.app, el).setValue(google.clientSecretId).onChange(async (value) => {
          google.clientSecretId = value;
          await save();
        }),
      );

    const status = gcal.status;
    const account = new Setting(containerEl).setName('Account');
    if (status === 'disconnected') {
      account.setDesc(
        Platform.isDesktopApp ? 'Not connected.' : 'Not connected. Connect from the desktop app.',
      );
      if (Platform.isDesktopApp) {
        account.addButton((button) =>
          button.setButtonText('Connect').onClick(async () => {
            button.setDisabled(true).setButtonText('Waiting for the browser…');
            try {
              await gcal.connect();
              new Notice('Horizon: connected to Google Calendar.');
            } catch (error) {
              new Notice(`Horizon: ${error instanceof Error ? error.message : String(error)}`);
            }
            this.display();
          }),
        );
      }
    } else {
      account.setDesc(status === 'error' ? gcal.lastError : 'Connected.');
      account.addButton((button) =>
        button.setButtonText('Disconnect').onClick(async () => {
          await gcal.disconnect();
          this.display();
        }),
      );
      if (status === 'error' && Platform.isDesktopApp) {
        account.addButton((button) =>
          button.setButtonText('Reconnect').onClick(async () => {
            try {
              await gcal.connect();
            } catch (error) {
              new Notice(`Horizon: ${error instanceof Error ? error.message : String(error)}`);
            }
            this.display();
          }),
        );
      }
    }

    new Setting(containerEl)
      .setName('Show events')
      .setDesc('Show Google Calendar events in every view.')
      .addToggle((toggle) =>
        toggle.setValue(google.enabled).onChange(async (value) => {
          google.enabled = value;
          await save(true);
        }),
      );

    const calendars = gcal.calendars();
    if (status === 'ready' && !calendars) {
      // Fetch the list once, then redraw with a toggle per calendar.
      void gcal.listCalendars().then(
        (list) => {
          if (list.length > 0 && this.containerEl.isConnected) this.display();
        },
        () => undefined,
      );
    }
    if (status !== 'disconnected' && calendars) {
      for (const calendar of calendars.filter((c) => c.selected)) {
        new Setting(containerEl)
          .setName(calendar.name)
          .setClass('horizon-setting-calendar')
          .addToggle((toggle) =>
            toggle.setValue(!google.hiddenCalendars.includes(calendar.id)).onChange(async (value) => {
              google.hiddenCalendars = value
                ? google.hiddenCalendars.filter((id) => id !== calendar.id)
                : [...google.hiddenCalendars, calendar.id];
              await save(true);
            }),
          );
      }
    }

    new Setting(containerEl)
      .setName('Meeting notes folder')
      .setDesc('Where "Create meeting note" puts new notes.')
      .addText((text) =>
        text
          .setPlaceholder('Meetings')
          .setValue(google.meetingFolder)
          .onChange(async (value) => {
            google.meetingFolder = value.trim();
            await save();
          }),
      );

    new Setting(containerEl)
      .setName('Meeting note template')
      .setDesc('Optional. {{title}}, {{date}} and {{time}} are filled from the event.')
      .addText((text) =>
        text
          .setPlaceholder('Templates/meeting')
          .setValue(google.meetingTemplate)
          .onChange(async (value) => {
            google.meetingTemplate = value.trim();
            await save();
          }),
      );

    new Setting(containerEl)
      .setName('Day starts at')
      .setDesc('Hour the day and week grid scrolls to when it opens.')
      .addSlider((slider) =>
        slider
          .setLimits(0, 12, 1)
          .setValue(google.dayStartHour)
          .onChange(async (value) => {
            google.dayStartHour = value;
            await save();
          }),
      );
  }

  private periodSection(period: Period): void {
    const { containerEl } = this;
    const config = this.plugin.settings.periods[period];
    new Setting(containerEl).setName(PERIOD_LABELS[period]).setHeading();

    new Setting(containerEl)
      .setName('Enable')
      .setDesc('Include this period in the calendar.')
      .addToggle((toggle) =>
        toggle.setValue(config.enabled).onChange(async (value) => {
          config.enabled = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('Folder')
      .addText((text) =>
        text
          .setPlaceholder('Daily')
          .setValue(config.folder)
          .onChange(async (value) => {
            config.folder = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Format')
      .setDesc('Moment format for the file name (e.g. DD-MM-YYYY, GGGG-[W]WW).')
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
      .setDesc('Path to the template for new notes (optional).')
      .addText((text) =>
        text
          .setPlaceholder('Templates/Daily Note')
          .setValue(config.template)
          .onChange(async (value) => {
            config.template = value.trim();
            await this.plugin.saveSettings();
          }),
      );
  }
}
