import type { CellPos, VentSpec } from '../core/level';
import { MAT, MATERIALS, type MaterialKey } from '../data/materials';
import { TUNING } from '../data/tuning';
import type { GameContext } from './context';

/** The exit portal: touch it to finish the level. */
export class Portal {
  constructor(readonly x: number, readonly y: number) {}

  touches(px: number, py: number): boolean {
    return Math.abs(px - (this.x + 0.5)) < 1 && Math.abs(py - (this.y + 0.5)) < 1.2;
  }
}

/** A glyph chest: walk into it and its charges fly into your pouch. */
export class Chest {
  opened = false;
  constructor(readonly x: number, readonly y: number) {}
}

/** A fire vent: keeps a gate of fire burning above it until water reaches its mouth. */
export class Vent {
  lit = true;
  constructor(readonly spec: VentSpec) {}
}

export class Features {
  readonly portal: Portal | null;
  readonly chests: Chest[];
  readonly vents: Vent[];
  /** The witch touched the portal. */
  exitReached = false;

  constructor(
    exit: CellPos | null,
    chests: readonly CellPos[],
    vents: readonly VentSpec[],
    /** What chests can hold. */
    private readonly loot: readonly MaterialKey[],
  ) {
    this.portal = exit ? new Portal(exit.x, exit.y) : null;
    this.chests = chests.map((c) => new Chest(c.x, c.y));
    this.vents = vents.map((v) => new Vent(v));
  }

  update(ctx: GameContext): void {
    const p = ctx.player;
    if (!p.dead && !this.exitReached && this.portal?.touches(p.x, p.y)) {
      this.exitReached = true;
      ctx.emit({ kind: 'portal' });
    }
    for (const c of this.chests) {
      if (!c.opened && !p.dead && Math.abs(p.x - (c.x + 0.5)) < 0.95 && Math.abs(p.y - (c.y + 0.5)) < 1) this.open(ctx, c);
    }
    for (const v of this.vents) if (v.lit) this.burn(ctx, v);
  }

  /** Two loot materials, flying out of the chest to the witch as glyphs. */
  private open(ctx: GameContext, c: Chest): void {
    c.opened = true;
    ctx.emit({ kind: 'chest' });
    const rng = ctx.rng;
    const picks = new Set<MaterialKey>();
    while (picks.size < Math.min(2, this.loot.length)) picks.add(rng.pick(this.loot));
    const parts: string[] = [];
    for (const key of picks) {
      const m = MAT[key];
      const n = rng.intRange(TUNING.chestChargesMin, TUNING.chestChargesMax);
      let sent = 0;
      for (let k = 0; k < n && ctx.pouch.hasRoom(m); k++, sent++) {
        const a = rng.range(0, Math.PI * 2);
        const s = rng.range(4, 9);
        ctx.harvester.particles.push({ x: c.x + 0.5, y: c.y + 0.3, prevX: c.x + 0.5, prevY: c.y + 0.3, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 4, material: m, age: 0 });
        ctx.pouch.inFlight[m] = (ctx.pouch.inFlight[m] as number) + 1;
      }
      if (sent > 0) parts.push(`\`${MATERIALS[m]?.glyph ?? '?'}\` ${sent}`);
    }
    ctx.stats.chestsOpened++;
    ctx.say(parts.length > 0 ? `Glyph chest: ${parts.join(' and ')}` : 'Glyph chest: your pouch is full.', 'info');
  }

  /** Feed the fire gate; water at the vent's mouth puts it out for good. */
  private burn(ctx: GameContext, v: Vent): void {
    const { x, y, w, h } = v.spec;
    const { grid, sim, rng } = ctx;
    for (let dx = 0; dx < w; dx++) {
      const mouth = grid.get(x + dx, y - 1);
      if (mouth === MAT.water || grid.get(x + dx, y - 2) === MAT.water) {
        v.lit = false;
        for (let k = 0; k < w; k++) for (let yy = y - h; yy < y; yy++) if (grid.get(x + k, yy) === MAT.fire) sim.place(x + k, yy, MAT.steam);
        ctx.say('The vent hisses out.', 'info');
        ctx.emit({ kind: 'sizzle', amount: 8 });
        return;
      }
    }
    for (let dx = 0; dx < w; dx++) {
      for (let yy = y - h; yy < y; yy++) {
        if (grid.get(x + dx, yy) === MAT.empty && rng.next() < TUNING.ventFireChance) sim.place(x + dx, yy, MAT.fire);
      }
    }
  }
}
