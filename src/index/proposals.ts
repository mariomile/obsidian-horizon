import { isValidDayKey } from '../dates.ts';
import type { DayKey, TaskDateKind } from '../types.ts';

/**
 * Agent proposals — the ghost-chip contract. Agents write this JSON with
 * normal file tools; Horizon renders ghosts and the human accepts/dismisses.
 */
export interface RescheduleProposal {
  id: string;
  kind: 'reschedule';
  path: string;
  line: number;
  rawText: string;
  dateKind: TaskDateKind;
  targetKey: DayKey;
  reason?: string;
}

export interface NewTaskProposal {
  id: string;
  kind: 'new-task';
  text: string;
  targetKey: DayKey;
  reason?: string;
}

export type Proposal = RescheduleProposal | NewTaskProposal;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseOne(value: unknown): Proposal | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || value.id === '') return null;
  if (typeof value.targetKey !== 'string' || !isValidDayKey(value.targetKey)) return null;
  const reason = typeof value.reason === 'string' ? value.reason : undefined;
  if (value.kind === 'reschedule') {
    if (
      typeof value.path !== 'string' ||
      typeof value.line !== 'number' ||
      !Number.isInteger(value.line) ||
      value.line < 0 ||
      typeof value.rawText !== 'string' ||
      (value.dateKind !== 'due' && value.dateKind !== 'scheduled' && value.dateKind !== 'done')
    ) {
      return null;
    }
    return {
      id: value.id,
      kind: 'reschedule',
      path: value.path,
      line: value.line,
      rawText: value.rawText,
      dateKind: value.dateKind,
      targetKey: value.targetKey,
      ...(reason !== undefined ? { reason } : {}),
    };
  }
  if (value.kind === 'new-task') {
    if (typeof value.text !== 'string' || value.text.trim() === '') return null;
    return {
      id: value.id,
      kind: 'new-task',
      text: value.text.trim(),
      targetKey: value.targetKey,
      ...(reason !== undefined ? { reason } : {}),
    };
  }
  return null;
}

/** Defensive parse: invalid entries are skipped, never fatal. */
export function parseProposals(raw: string): Proposal[] {
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || !Array.isArray(value.proposals)) return [];
    const result: Proposal[] = [];
    for (const entry of value.proposals) {
      const parsed = parseOne(entry);
      if (parsed) result.push(parsed);
    }
    return result;
  } catch {
    return [];
  }
}

/** Rewrite the proposals file content without the given id (pure). */
export function removeProposal(raw: string, id: string): string {
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || !Array.isArray(value.proposals)) return raw;
    const proposals = value.proposals.filter(
      (entry) => !(isRecord(entry) && entry.id === id),
    );
    return JSON.stringify({ ...value, proposals }, null, 2);
  } catch {
    return raw;
  }
}

/** Atomically append-ready rewrite used inside Vault.process. */
export function appendProposal(raw: string, proposal: Proposal): string {
  let value: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isRecord(parsed)) value = parsed;
  } catch {
    // Missing/corrupt content starts a clean proposal sidecar.
  }
  const proposals = Array.isArray(value.proposals) ? [...value.proposals] : [];
  proposals.push(proposal);
  return JSON.stringify({ ...value, proposals }, null, 2);
}
