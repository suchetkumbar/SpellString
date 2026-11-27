/** Default key bindings, by KeyboardEvent.code. Remapping arrives in M9. */
export const CONTROLS = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  up: ['KeyW', 'ArrowUp', 'Space'],
  down: ['KeyS', 'ArrowDown'],
  zoomIn: ['Equal', 'NumpadAdd'],
  zoomOut: ['Minus', 'NumpadSubtract'],
  debug: ['F3'],
  editor: ['Tab'],
  pause: ['Escape'],
} as const satisfies Record<string, readonly string[]>;

export type Action = keyof typeof CONTROLS;

/** Keys whose browser default (scrolling, focus change, find bar) we suppress. */
export const PREVENT_DEFAULT_KEYS: ReadonlySet<string> = new Set([
  'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'F3',
]);
