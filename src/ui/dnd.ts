import type { DayKey, TaskDateKind } from '../types.ts';

export const TASK_MIME = 'application/x-horizon-task';

export interface DragPayload {
  path: string;
  line: number;
  rawText: string;
  dateKind: TaskDateKind;
  fromKey: DayKey;
}

export function parseDragPayload(raw: string): DragPayload | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const p = value as Record<string, unknown>;
    if (
      typeof p.path !== 'string' ||
      typeof p.line !== 'number' ||
      typeof p.rawText !== 'string' ||
      typeof p.fromKey !== 'string' ||
      (p.dateKind !== 'due' && p.dateKind !== 'scheduled' && p.dateKind !== 'done')
    ) {
      return null;
    }
    return {
      path: p.path,
      line: p.line,
      rawText: p.rawText,
      dateKind: p.dateKind,
      fromKey: p.fromKey,
    };
  } catch {
    return null;
  }
}

/**
 * Delegated drop-target wiring for a grid/list of day elements identified by
 * `cellSelector` (each must carry data-key). Returns an unregister function
 * suitable for Component.register().
 */
export function registerDropTargets(
  containerEl: HTMLElement,
  cellSelector: string,
  onDrop: (payload: DragPayload, targetKey: DayKey) => void,
): () => void {
  let marked: HTMLElement | null = null;

  const clearMark = (): void => {
    marked?.removeClass('horizon-drop');
    marked = null;
  };

  const findCell = (event: DragEvent): HTMLElement | null => {
    const target = event.target;
    if (!(target instanceof Element)) return null;
    const cell = target.closest<HTMLElement>(cellSelector);
    return cell?.dataset.key ? cell : null;
  };

  const onDragOver = (event: DragEvent): void => {
    if (!event.dataTransfer?.types.includes(TASK_MIME)) return;
    const cell = findCell(event);
    if (!cell) {
      clearMark();
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (marked !== cell) {
      clearMark();
      marked = cell;
      cell.addClass('horizon-drop');
    }
  };

  const onDropEvent = (event: DragEvent): void => {
    const cell = findCell(event);
    const raw = event.dataTransfer?.getData(TASK_MIME);
    clearMark();
    if (!cell?.dataset.key || raw === undefined || raw === '') return;
    event.preventDefault();
    const payload = parseDragPayload(raw);
    if (!payload || payload.fromKey === cell.dataset.key) return;
    onDrop(payload, cell.dataset.key);
  };

  const onDragEnd = (): void => clearMark();

  containerEl.addEventListener('dragover', onDragOver);
  containerEl.addEventListener('drop', onDropEvent);
  containerEl.addEventListener('dragleave', onDragEnd);
  return () => {
    containerEl.removeEventListener('dragover', onDragOver);
    containerEl.removeEventListener('drop', onDropEvent);
    containerEl.removeEventListener('dragleave', onDragEnd);
  };
}
