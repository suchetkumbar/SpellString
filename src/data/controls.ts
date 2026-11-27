import type { MaterialKey } from './materials';

/**
 * Default bindings, by KeyboardEvent.code. Gamepad buttons appear as `Pad*`
 * codes (standard mapping: PadA/B/X/Y, PadLB/RB/LT/RT, PadBack/Start, and the
 * d-pad or left stick as PadUp/Down/Left/Right). Players can remap the
 * keyboard keys of the actions in REMAPPABLE (settings).
 */
export const CONTROLS = {
  left: ['KeyA', 'ArrowLeft', 'PadLeft'],
  right: ['KeyD', 'ArrowRight', 'PadRight'],
  /** Jump; also swims up in liquid. */
  jump: ['KeyW', 'ArrowUp', 'Space', 'PadA'],
  /** Swims down in liquid. */
  down: ['KeyS', 'ArrowDown', 'PadDown'],
  /** Cast and harvest (the mouse buttons always work too). */
  cast: ['PadRT'],
  harvest: ['PadLT'],
  /** Switch to wand 1, 2 or 3 (also picks shrine gifts 1-3). */
  wand1: ['Digit1', 'PadX'],
  wand2: ['Digit2', 'PadY'],
  wand3: ['Digit3', 'PadB'],
  /** Menus: confirm. After death: start again. */
  confirm: ['Enter', 'NumpadEnter', 'PadA'],
  restart: ['KeyR', 'Enter', 'PadA'],
  zoomIn: ['Equal', 'NumpadAdd', 'PadRB'],
  zoomOut: ['Minus', 'NumpadSubtract', 'PadLB'],
  debug: ['F3'],
  editor: ['Tab'],
  pause: ['Escape', 'PadStart'],
  codex: ['KeyC', 'PadBack'],
  /** The how-to-play guide, from anywhere. */
  guide: ['KeyH', 'F1'],
  lab: ['KeyL'],
  labClear: ['KeyC'],
  labPause: ['KeyP'],
  labStep: ['KeyN'],
  /** Lab: cycle the creature K spawns. */
  labCreature: ['KeyJ'],
  /** Lab: spawn the chosen creature at the cursor. */
  labSpawn: ['KeyK'],
  /** Held while painting in Lab: overwrite existing cells instead of filling only empty space. */
  labOverwrite: ['ShiftLeft', 'ShiftRight'],
  /** Lab: previous / next material. */
  labPrev: ['BracketLeft'],
  labNext: ['BracketRight'],
} as const satisfies Record<string, readonly string[]>;

export type Action = keyof typeof CONTROLS;

/** Actions shown in the settings screen, with their labels, that the player may rebind. */
export const REMAPPABLE: readonly (readonly [Action, string])[] = [
  ['left', 'move left'],
  ['right', 'move right'],
  ['jump', 'jump / swim up'],
  ['down', 'swim down'],
  ['editor', 'spell editor'],
  ['wand1', 'wand 1'],
  ['wand2', 'wand 2'],
  ['wand3', 'wand 3'],
  ['zoomIn', 'zoom in'],
  ['zoomOut', 'zoom out'],
  ['restart', 'restart (after death)'],
  ['guide', 'how to play'],
];

/** Keys whose browser default (scrolling, focus change, find bar) we suppress. */
export const PREVENT_DEFAULT_KEYS: ReadonlySet<string> = new Set([
  'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'F1', 'F3',
]);

/** Lab mode: number keys 1-9 and 0 pick the first ten; [ and ] step through all of them. */
export const LAB_PALETTE = ['rock', 'sand', 'water', 'fire', 'oil', 'wood', 'steam', 'smoke', 'acid', 'ice', 'gunpowder', 'gold'] as const satisfies readonly MaterialKey[];
