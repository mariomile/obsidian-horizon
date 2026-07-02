import type { App, Plugin } from 'obsidian';

import { parseProposals, removeProposal } from './proposals.ts';
import type { Proposal } from './proposals.ts';
import type { DayKey } from '../types.ts';

/**
 * Thin watcher over the agent-proposals sidecar file. Agents write it with
 * normal file tools; Horizon reads, renders ghosts, and removes entries on
 * accept/dismiss. The human is the only committer.
 */
export class ProposalsService {
  private readonly app: App;
  private readonly getPath: () => string;
  private proposals: Proposal[] = [];
  private readonly listeners = new Set<() => void>();

  constructor(app: App, getPath: () => string) {
    this.app = app;
    this.getPath = getPath;
  }

  start(plugin: Plugin): void {
    const relevant = (path: string): boolean => path === this.getPath();
    plugin.registerEvent(
      this.app.vault.on('modify', (file) => {
        if (relevant(file.path)) void this.reload();
      }),
    );
    plugin.registerEvent(
      this.app.vault.on('create', (file) => {
        if (relevant(file.path)) void this.reload();
      }),
    );
    plugin.registerEvent(
      this.app.vault.on('delete', (file) => {
        if (relevant(file.path)) {
          this.proposals = [];
          this.emit();
        }
      }),
    );
    this.app.workspace.onLayoutReady(() => {
      void this.reload();
    });
  }

  all(): Proposal[] {
    return this.proposals;
  }

  forDay(key: DayKey): Proposal[] {
    return this.proposals.filter((p) => p.targetKey === key);
  }

  get(id: string): Proposal | undefined {
    return this.proposals.find((p) => p.id === id);
  }

  async remove(id: string): Promise<void> {
    const file = this.app.vault.getFileByPath(this.getPath());
    if (!file) return;
    await this.app.vault.process(file, (content) => removeProposal(content, id));
    await this.reload();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async reload(): Promise<void> {
    const file = this.app.vault.getFileByPath(this.getPath());
    if (!file) {
      if (this.proposals.length > 0) {
        this.proposals = [];
        this.emit();
      }
      return;
    }
    const raw = await this.app.vault.cachedRead(file);
    this.proposals = parseProposals(raw);
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
