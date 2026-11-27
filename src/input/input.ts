import { CONTROLS, PREVENT_DEFAULT_KEYS, type Action } from '../data/controls';
import { screenToCell, type ViewTransform } from '../render/camera';

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
  /** Wheel notches since the last frame (positive = scrolled down / toward the user). */
  wheel = 0;
  private readonly cleanup: Array<() => void> = [];

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.on(window, 'keydown', (e: KeyboardEvent) => {
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

  action(a: Action): boolean {
    return CONTROLS[a].some((c) => this.down.has(c));
  }

  actionPressed(a: Action): boolean {
    return CONTROLS[a].some((c) => this.pressed.has(c));
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

  /** Call once at the end of each rendered frame. */
  endFrame(): void {
    this.pressed.clear();
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
