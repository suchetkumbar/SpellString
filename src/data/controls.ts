import type { MaterialKey } from './materials';

/** Default key bindings, by KeyboardEvent.code. Remapping arrives in M9. */
export const CONTROLS = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  /** Jump; also swims up in liquid. */
  jump: ['KeyW', 'ArrowUp', 'Space'],
  /** Swims down in liquid. */
  down: ['KeyS', 'ArrowDown'],
  /** After death: start again. */
  restart: ['KeyR', 'Enter'],
  zoomIn: ['Equal', 'NumpadAdd'],
  zoomOut: ['Minus', 'NumpadSubtract'],
  debug: ['F3'],
  editor: ['Tab'],
  pause: ['Escape'],
  lab: ['KeyL'],
  labClear: ['KeyC'],
  labPause: ['KeyP'],
  labStep: ['KeyN'],
  /** Held while painting in Lab: overwrite existing cells instead of filling only empty space. */
  labOverwrite: ['ShiftLeft', 'ShiftRight'],
} as const satisfies Record<string, readonly string[]>;

export type Action = keyof typeof CONTROLS;

/** Keys whose browser default (scrolling, focus change, find bar) we suppress. */
export const PREVENT_DEFAULT_KEYS: ReadonlySet<string> = new Set([
  'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'F3',
]);

/** Lab mode: number keys 1-9 pick these materials, in order. */
export const LAB_PALETTE = ['rock', 'sand', 'water', 'fire', 'oil', 'wood', 'steam', 'smoke'] as const satisfies readonly MaterialKey[];
