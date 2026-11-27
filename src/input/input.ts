import { CONTROLS, PREVENT_DEFAULT_KEYS, type Action } from '../data/controls';
import { screenToCell, type ViewTransform } from '../render/camera';

/** Standard gamepad mapping: button index -> code. */
const PAD_BUTTONS: readonly (string | null)[] = [
  'PadA', 'PadB', 'PadX', 'PadY', 'PadLB', 'PadRB', 'PadLT', 'PadRT', 'PadBack', 'PadStart', null, null, 'PadUp', 'PadDown', 'PadLeft', 'PadRight',
];
const STICK_DEAD = 0.4;

/**
 * Keyboard + mouse state. Held state is continuous; "pressed" edges are
 * collected between frames and cleared by endFrame().
 */
export class InputManager {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();
  /** Mouse position relative to the canvas, in CSS pixels. */
  mouseX = 0;
  mouseY = 0;
  mouseInside = false;
  /** Bitmask of held mouse buttons (1 = left, 2 = right, 4 = middle). */
  mouseButtons = 0;
  /** Buttons pressed since the last frame (same bits), so a click shorter than a frame still counts. */
  mousePressed = 0;
  /** Wheel notches since the last frame (positive = scrolled down / toward the user). */
  wheel = 0;
  private readonly cleanup: Array<() => void> = [];

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.on(window, 'keydown', (e: KeyboardEvent) => {
      // Typing into a text field (the spell editor) isn't game input. Key-ups still count, so nothing sticks.
      if (isTextField(e.target)) return;
      if (PREVENT_DEFAULT_KEYS.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    this.on(window, 'keyup', (e: KeyboardEvent) => {
      this.down.delete(e.code);
    });
    this.on(window, 'blur', () => {
      this.down.clear();
      this.mouseButtons = 0;
    });
    this.on(window, 'pointermove', (e: PointerEvent) => this.trackPointer(e));
    this.on(canvas, 'pointerdown', (e: PointerEvent) => {
      this.trackPointer(e);
      this.mouseButtons = e.buttons;
      this.mousePressed |= e.buttons;
    });
    this.on(window, 'pointerup', (e: PointerEvent) => {
      this.mouseButtons = e.buttons;
    });
    this.on(canvas, 'pointerleave', () => {
      this.mouseInside = false;
    });
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      this.wheel += Math.sign(e.deltaY);
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    this.cleanup.push(() => canvas.removeEventListener('wheel', onWheel));
    // Right click is the harvest button (M3); never open the context menu over the game.
    this.on(canvas, 'contextmenu', (e: Event) => e.preventDefault());
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  /** Keys bound to an action: the settings' overrides, else the defaults. */
  bindings: (a: Action) => readonly string[] = (a) => CONTROLS[a];

  action(a: Action): boolean {
    return this.bindings(a).some((c) => this.down.has(c) || this.padDown.has(c));
  }

  actionPressed(a: Action): boolean {
    return this.bindings(a).some((c) => this.pressed.has(c));
  }

  /** A gamepad is connected and was used. */
  padActive = false;
  /** Right-stick aim (-1..1 each axis), or null when the stick is at rest. */
  padAim: { x: number; y: number } | null = null;
  private readonly padDown = new Set<string>();

  /**
   * Read the first gamepad (standard mapping) once per frame. Buttons become
   * Pad* codes, so bindings, menus and remapping all work the same way.
   */
  pollGamepad(): void {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = Array.from(pads ?? []).find((p) => p !== null) ?? null;
    const now = new Set<string>();
    this.padAim = null;
    if (pad) {
      const btn = (i: number): boolean => pad.buttons[i]?.pressed === true || (pad.buttons[i]?.value ?? 0) > 0.5;
      PAD_BUTTONS.forEach((code, i) => {
        if (code && btn(i)) now.add(code);
      });
      const lx = pad.axes[0] ?? 0;
      const ly = pad.axes[1] ?? 0;
      if (lx < -STICK_DEAD) now.add('PadLeft');
      if (lx > STICK_DEAD) now.add('PadRight');
      if (ly < -STICK_DEAD) now.add('PadUp');
      if (ly > STICK_DEAD) now.add('PadDown');
      const rx = pad.axes[2] ?? 0;
      const ry = pad.axes[3] ?? 0;
      if (Math.hypot(rx, ry) > 0.3) this.padAim = { x: rx, y: ry };
      if (now.size > 0 || this.padAim) this.padActive = true;
    }
    for (const c of now) if (!this.padDown.has(c)) this.pressed.add(c);
    this.padDown.clear();
    for (const c of now) this.padDown.add(c);
  }

  /** -1, 0 or 1 from two opposing actions. */
  axis(negative: Action, positive: Action): number {
    return (this.action(positive) ? 1 : 0) - (this.action(negative) ? 1 : 0);
  }

  /** The cell under the mouse for a given view, or null if the mouse is off the canvas. */
  mouseCell(view: ViewTransform | null, dpr: number): { x: number; y: number } | null {
    if (!view || !this.mouseInside) return null;
    return screenToCell(view, this.mouseX * dpr, this.mouseY * dpr);
  }

  /** The mouse in world cell units (fractional), or null if the mouse is off the canvas. */
  mouseWorld(view: ViewTransform | null, dpr: number): { x: number; y: number } | null {
    if (!view || !this.mouseInside) return null;
    return { x: (this.mouseX * dpr - view.originX) / view.cell, y: (this.mouseY * dpr - view.originY) / view.cell };
  }

  /** Call once at the end of each rendered frame. */
  endFrame(): void {
    this.pressed.clear();
    this.mousePressed = 0;
    this.wheel = 0;
  }

  dispose(): void {
    for (const off of this.cleanup) off();
    this.cleanup.length = 0;
  }

  private trackPointer(e: PointerEvent): void {
    const r = this.canvas.getBoundingClientRect();
    this.mouseX = e.clientX - r.left;
    this.mouseY = e.clientY - r.top;
    this.mouseInside = this.mouseX >= 0 && this.mouseY >= 0 && this.mouseX < r.width && this.mouseY < r.height;
  }

  private on<K extends keyof WindowEventMap>(
    target: Window | HTMLElement,
    type: K,
    handler: (e: WindowEventMap[K]) => void,
  ): void {
    const h = handler as EventListener;
    target.addEventListener(type, h);
    this.cleanup.push(() => target.removeEventListener(type, h));
  }
}

function isTextField(t: EventTarget | null): boolean {
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || (t instanceof HTMLElement && t.isContentEditable);
}
