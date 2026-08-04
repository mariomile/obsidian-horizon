/**
 * Modulo di compatibilità: `makeButtonLike` e `isActivationKey` vivono ora nel
 * kit, insieme ai primitivi CSS di cui sono la metà DOM. Qui resta il solo
 * re-export, così i call site di Horizon non cambiano import.
 */
export { isActivationKey, makeButtonLike } from '../kit/controls.ts';
