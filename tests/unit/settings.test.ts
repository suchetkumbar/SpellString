import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../../src/core/storage';
import { CONTROLS } from '../../src/data/controls';
import { DEFAULT_SETTINGS, SETTINGS_KEY, Settings, parseSettings } from '../../src/game/settings';
import { Juice } from '../../src/render/juice';
import { Game, NO_INPUT, tickInput } from '../../src/game/game';
import { MAT } from '../../src/data/materials';
import { buildStyleTable } from '../../src/render/styles';

describe('settings', () => {
  it('persist across a reload (mocked storage)', () => {
    const store = new MemoryStore();
    const a = new Settings(store);
    expect(a.data).toEqual(DEFAULT_SETTINGS);
    a.update({ masterVolume: 0.3, shake: false, crt: false, reduceFlashing: true, highContrast: true });
    a.rebind('jump', 'KeyK');
    const b = new Settings(store);
    expect(b.data.masterVolume).toBe(0.3);
    expect(b.data.shake).toBe(false);
    expect(b.data.crt).toBe(false);
    expect(b.data.reduceFlashing).toBe(true);
    expect(b.data.highContrast).toBe(true);
    expect(b.keysFor('jump')).toEqual(['KeyK', 'PadA']); // the gamepad button stays
    expect(b.keysFor('left')).toEqual(CONTROLS.left);
    b.resetKeys();
    expect(new Settings(store).keysFor('jump')).toEqual(CONTROLS.jump);
  });

  it('falls back to defaults for missing, corrupt or out-of-range values', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('nope')).toEqual(DEFAULT_SETTINGS);
    const s = parseSettings(JSON.stringify({ masterVolume: 7, sfxVolume: -1, shake: 'yes', keys: { jump: [], fly: ['KeyF'], left: ['KeyJ'] } }));
    expect(s.masterVolume).toBe(1);
    expect(s.sfxVolume).toBe(0);
    expect(s.shake).toBe(DEFAULT_SETTINGS.shake);
    expect(s.keys).toEqual({ left: ['KeyJ'] });
    const store = new MemoryStore();
    store.set(SETTINGS_KEY, '{"crt":false}');
    expect(new Settings(store).data.crt).toBe(false);
  });

  it('notifies listeners on change', () => {
    const s = new Settings(new MemoryStore());
    const seen: boolean[] = [];
    s.onChange((d) => seen.push(d.glow));
    s.update({ glow: false });
    expect(seen).toEqual([false]);
  });
});

describe('juice', () => {
  it('shakes on explosions and blows, settles back to zero, and freezes briefly (hit-stop)', () => {
    const j = new Juice({ shake: true, hitStop: true, reduceFlashing: false });
    j.feed({ kind: 'explode', x: 0, y: 0, r: 6 });
    expect(j.stopping).toBe(true);
    expect(j.flash).toBeGreaterThan(0);
    const o = j.update(16);
    expect(Math.hypot(o.x, o.y)).toBeGreaterThan(0);
    for (let k = 0; k < 120; k++) j.update(16);
    expect(j.stopping).toBe(false);
    expect(j.update(16)).toEqual({ x: 0, y: 0 });
  });

  it('every effect has an off switch', () => {
    const j = new Juice({ shake: false, hitStop: false, reduceFlashing: true });
    j.feed({ kind: 'explode', x: 0, y: 0, r: 6 });
    j.feed({ kind: 'hurt', amount: 20 });
    expect(j.stopping).toBe(false);
    expect(j.flash).toBe(0);
    expect(j.update(16)).toEqual({ x: 0, y: 0 });
  });
});

describe('high-contrast palette', () => {
  it('is brighter and flat on pure black', () => {
    const normal = buildStyleTable();
    const hc = buildStyleTable({ highContrast: true });
    expect(hc.background).toBe('#000000');
    expect(hc.styles.length).toBe(normal.styles.length);
    const first = hc.materialFirst[MAT.sand] as number;
    // Flat: every shade of sand is the same color.
    expect(new Set([0, 1, 2, 3].map((s) => hc.styles[first + s]!.color)).size).toBe(1);
  });
});

describe('game events (for sound and shake)', () => {
  it('a cast, its impact and a death are reported', () => {
    const g = Game.fromAscii(
      `
      ####################
      #                  #
      #  @               #
      ####################`,
      1,
    );
    for (let t = 0; t < 10; t++) g.step(NO_INPUT);
    g.events.length = 0;
    g.step(tickInput({ cast: true, aimX: 18, aimY: 2.5 }));
    for (let t = 0; t < 40; t++) g.step(tickInput({ aimX: 18, aimY: 2.5 }));
    const kinds = g.events.map((e) => e.kind);
    expect(kinds).toContain('cast');
    expect(kinds).toContain('impact');
    g.events.length = 0;
    g.player.hp = 0.1;
    g.player.burning = 50;
    for (let t = 0; t < 5; t++) g.step(NO_INPUT);
    expect(g.events.filter((e) => e.kind === 'death')).toHaveLength(1);
  });

  it('explosions are reported with their radius, and a fire meeting water sizzles', () => {
    const g = Game.fromAscii(
      `
      ##############
      #            #
      #@     :::   #
      ##############`,
      1,
    );
    g.sim.place(6, 2, MAT.fire);
    for (let t = 0; t < 20; t++) g.step(NO_INPUT);
    expect(g.events.some((e) => e.kind === 'explode' && e.r > 2)).toBe(true);
    const w = Game.fromAscii(
      `
      ##########
      #  ~~~~  #
      #@ ^^^^  #
      ##########`,
      1,
    );
    for (let t = 0; t < 20; t++) w.step(NO_INPUT);
    expect(w.events.some((e) => e.kind === 'sizzle')).toBe(true);
  });

  it('a headless game never piles up events without bound', () => {
    const g = Game.fromAscii('#@~^~^~^~^~^~^~^#', 1);
    for (let t = 0; t < 2000; t++) g.step(tickInput({ cast: t % 2 === 0, aimX: 10, aimY: 0 }));
    expect(g.events.length).toBeLessThanOrEqual(256);
  });
});
