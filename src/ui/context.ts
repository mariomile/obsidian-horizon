import type { App } from 'obsidian';

import type { DayIndexService } from '../index/indexer.ts';
import type { MomentLike, PeriodicService } from '../index/periodic.ts';
import type { HorizonSettings } from '../settings.ts';
import type { UiState } from '../state.ts';

/** Everything a Horizon view needs, injected by the plugin. */
export interface HorizonContext {
  app: App;
  moment: MomentLike;
  settings: HorizonSettings;
  periodic: PeriodicService;
  dayIndex: DayIndexService;
  uiState: UiState;
  saveSettings(): Promise<void>;
}
