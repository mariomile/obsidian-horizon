import { Notice } from 'obsidian';

import { ensurePeriodicNote } from './note-creator.ts';
import { rescheduleTask } from './task-edit.ts';
import type { Proposal } from '../index/proposals.ts';
import type { HorizonContext } from '../ui/context.ts';

/**
 * Accept a ghost-chip proposal. Reschedules go through the guarded write
 * path; new tasks land at the end of the target day's daily note (created
 * from template when missing — accepting IS the confirmation).
 */
export async function acceptProposal(ctx: HorizonContext, proposal: Proposal): Promise<boolean> {
  if (proposal.kind === 'reschedule') {
    const ok = await rescheduleTask(
      ctx,
      { path: proposal.path, line: proposal.line, rawText: proposal.rawText },
      proposal.dateKind,
      proposal.targetKey,
      { silent: true },
    );
    new Notice(
      ok
        ? `Horizon: proposta accettata — task al ${proposal.targetKey}.`
        : 'Horizon: il task della proposta è cambiato — proposta scartata.',
    );
    return ok;
  }

  const file = await ensurePeriodicNote(ctx, 'daily', proposal.targetKey);
  if (!file) {
    new Notice('Horizon: impossibile creare la nota del giorno per la proposta.');
    return false;
  }
  await ctx.app.vault.process(file, (content) => {
    const line = `- [ ] ${proposal.text} 📅 ${proposal.targetKey}`;
    return content.endsWith('\n') ? `${content}${line}\n` : `${content}\n${line}\n`;
  });
  new Notice(`Horizon: task creato il ${proposal.targetKey}.`);
  return true;
}
