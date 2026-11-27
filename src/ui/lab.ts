import type { Simulation } from '../core/sim';
import { LAB_PALETTE } from '../data/controls';
import { MAT, MATERIALS } from '../data/materials';
import { TUNING } from '../data/tuning';
import type { InputManager } from '../input/input';
import { BEH, behaviorOf } from '../core/materialTable';
import { CREATURES, type CreatureKey } from '../data/creatures';

/** What the Lab edits: the material sim and the creatures. */
export interface LabWorld {
  readonly sim: Simulation;
  readonly creatures: { length: number };
  spawnCreature(key: CreatureKey, x: number, y: number): unknown;
}

/**
 * Lab mode: a sandbox for painting materials and watching the chemistry.
 * L toggles it. Left mouse paints, right mouse erases, wheel changes brush
 * size, 1-8 pick a material, Shift overwrites, C clears, P pauses, N steps.
 */
export class Lab {
  enabled = false;
  paused = false;
  brush: number = TUNING.labBrushDefault;
  material: number = MAT.sand;
  /** Creature K spawns (J cycles). */
  creature = 0;
  private last: { x: number; y: number } | null = null;
  private readonly swatches: HTMLElement[] = [];
  private readonly status: HTMLElement;

  constructor(private readonly panel: HTMLElement) {
    panel.hidden = true;
    panel.textContent = '';
    const title = document.createElement('div');
    title.className = 'lab-title';
    title.textContent = 'LAB';
    panel.append(title);
    const row = document.createElement('div');
    row.className = 'lab-palette';
    LAB_PALETTE.forEach((key, n) => {
      const def = MATERIALS[MAT[key]]!;
      const sw = document.createElement('span');
      sw.className = 'lab-swatch';
      sw.dataset.material = String(def.id);
      const num = document.createElement('b');
      num.textContent = String(n + 1);
      const glyph = document.createElement('span');
      glyph.textContent = def.glyph;
      glyph.style.color = def.color;
      sw.append(num, ' ', glyph, ` ${def.name}`);
      row.append(sw);
      this.swatches.push(sw);
    });
    panel.append(row);
    this.status = document.createElement('div');
    this.status.className = 'lab-status';
    panel.append(this.status);
    const help = document.createElement('div');
    help.className = 'lab-help';
    help.textContent =
      'left: paint · right: erase · wheel: brush · shift: overwrite · J/K: pick/spawn creature · C: clear · P: pause · N: step · L: exit';
    panel.append(help);
    this.refresh();
  }

  /** Turn Lab mode on or off. */
  setEnabled(on: boolean): void {
    this.enabled = on;
    this.panel.hidden = !on;
    this.paused = false;
    this.last = null;
    this.refresh();
  }

  /**
   * Handle Lab input for this frame. `canToggle`: L switches Lab mode on and off
   * (only in the Lab and the test room, never in a real run). Returns the number
   * of single steps requested (N).
   */
  update(input: InputManager, world: LabWorld, cursor: { x: number; y: number } | null, canToggle = true): number {
    const sim = world.sim;
    if (canToggle && input.actionPressed('lab')) this.setEnabled(!this.enabled);
    if (!this.enabled) return 0;

    let steps = 0;
    LAB_PALETTE.forEach((key, n) => {
      if (input.wasPressed(`Digit${n + 1}`) || input.wasPressed(`Numpad${n + 1}`)) this.material = MAT[key];
    });
    if (input.wheel !== 0) {
      this.brush = Math.min(TUNING.labBrushMax, Math.max(0, this.brush - input.wheel));
    }
    if (input.actionPressed('labClear')) {
      sim.clear();
      world.creatures.length = 0;
    }
    if (input.actionPressed('labCreature')) this.creature = (this.creature + 1) % CREATURES.length;
    if (input.actionPressed('labSpawn') && cursor) world.spawnCreature(CREATURES[this.creature]!.key, cursor.x + 0.5, cursor.y + 0.5);
    if (input.actionPressed('labPause')) this.paused = !this.paused;
    if (input.actionPressed('labStep')) {
      this.paused = true;
      steps++;
    }

    const painting = (input.mouseButtons & 1) !== 0;
    const erasing = (input.mouseButtons & 2) !== 0;
    if (cursor && (painting || erasing)) {
      const from = this.last ?? cursor;
      const mat = erasing ? MAT.empty : this.material;
      const overwrite = erasing || input.action('labOverwrite');
      line(from.x, from.y, cursor.x, cursor.y, (x, y) => this.stamp(sim, x, y, mat, overwrite));
      this.last = cursor;
    } else {
      this.last = null;
    }
    this.refresh();
    return steps;
  }

  private stamp(sim: Simulation, cx: number, cy: number, mat: number, overwrite: boolean): void {
    const r = this.brush;
    const g = sim.grid;
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 > r * r + r) continue;
        if (!g.inBounds(x, y)) continue;
        const cur = g.get(x, y);
        if (cur === mat) continue;
        if (!overwrite && cur !== MAT.empty && behaviorOf[cur] !== BEH.gas) continue;
        sim.place(x, y, mat);
      }
    }
  }

  private refresh(): void {
    for (const sw of this.swatches) sw.classList.toggle('selected', Number(sw.dataset.material) === this.material);
    const c = CREATURES[this.creature]!;
    const text = `brush ${this.brush}   creature [K] ${c.glyph} ${c.name}${this.paused ? '   PAUSED' : ''}`;
    if (this.status.textContent !== text) this.status.textContent = text;
  }
}

/** Bresenham line, calling `plot` for every cell from (x0, y0) to (x1, y1). */
function line(x0: number, y0: number, x1: number, y1: number, plot: (x: number, y: number) => void): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    plot(x0, y0);
    if (x0 === x1 && y0 === y1) return;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}
