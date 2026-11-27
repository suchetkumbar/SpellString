import { describe, expect, it } from 'vitest';
import { scenario, World } from '../helpers/scenario';
import { MATERIALS } from '../../src/data/materials';
import { REACTIONS } from '../../src/data/reactions';

describe('material and reaction data', () => {
  it('every material has a unique single-character glyph', () => {
    const glyphs = MATERIALS.map((m) => m.glyph);
    expect(new Set(glyphs).size).toBe(glyphs.length);
    for (const g of glyphs) expect(g).toHaveLength(1);
  });

  it('ids match array positions', () => {
    MATERIALS.forEach((m, i) => expect(m.id).toBe(i));
  });

  it('reaction ids are unique and chances are probabilities', () => {
    expect(new Set(REACTIONS.map((r) => r.id)).size).toBe(REACTIONS.length);
    for (const r of REACTIONS) if (r.kind === 'contact') expect(r.chance > 0 && r.chance <= 1).toBe(true);
  });
});

describe('static: rock and wood', () => {
  scenario('unsupported rock and wood never move, and hold up powder and liquid', {
    before: `
      ############
      #  .   |~| #
      # ###  ||| #
      #          #
      #          #
      ############`,
    ticks: 120,
    after: `
      ############
      #  .   |~| #
      # ###  ||| #
      #          #
      #          #
      ############`,
  });
});

describe('powder: sand', () => {
  scenario('a grain falls straight down onto the floor', {
    before: `
      #####
      # . #
      #   #
      #   #
      #####`,
    ticks: 3,
    after: `
      #####
      #   #
      #   #
      # . #
      #####`,
  });

  scenario('a grain slides off a peak diagonally', {
    before: `
      #####
      # . #
      # . #
      #####`,
    ticks: 4,
    expect: (w) => w.at(2, 2) === '.' && (w.at(1, 2) === '.' || w.at(3, 2) === '.'),
  });

  it('piles into a slope, conserving every grain', () => {
    const w = new World(`
      #########################
      #           .           #
      #           .           #
      #           .           #
      #           .           #
      #           .           #
      #           .           #
      #           .           #
      #           .           #
      #           .           #
      #           .           #
      #           .           #
      #           .           #
      #                       #
      #                       #
      #########################`);
    w.step(400);
    expect(w.count('.')).toBe(12);
    // Column heights: sand count per column.
    const heights: number[] = [];
    for (let x = 1; x < w.width - 1; x++) {
      let h = 0;
      for (let y = 0; y < w.height; y++) if (w.at(x, y) === '.') h++;
      heights.push(h);
    }
    const peak = Math.max(...heights);
    const peakAt = heights.indexOf(peak);
    expect(peak).toBeLessThan(6);
    expect(heights.filter((h) => h > 0).length).toBeGreaterThanOrEqual(5);
    // Monotone slope down each side of the peak (allowing equal neighbors).
    for (let i = peakAt; i > 0; i--) expect(heights[i - 1]).toBeLessThanOrEqual(heights[i]!);
    for (let i = peakAt; i < heights.length - 1; i++) expect(heights[i + 1]).toBeLessThanOrEqual(heights[i]!);
    // And a powder slope can't be steeper than one cell per column.
    for (let i = 1; i < heights.length; i++) expect(Math.abs(heights[i]! - heights[i - 1]!)).toBeLessThanOrEqual(1);
  });

  scenario('sinks through water', {
    before: `
      #####
      # . #
      # ~ #
      # ~ #
      #####`,
    ticks: 60,
    expect: (w) => w.top('.') === 3 && w.count('.') === 1 && w.count('~') === 2,
  });
});

describe('liquid: water and oil', () => {
  scenario('water spreads flat across a floor', {
    before: `
      ###########
      #   ~~~   #
      #   ~~~   #
      #         #
      ###########`,
    ticks: 120,
    expect: (w) => w.top('~') === 3 && w.count('~') === 6,
  });

  it('levels out in a U-tube', () => {
    const w = new World(`
      ############
      #     #    #
      #~~~~~#    #
      #~~~~~#    #
      #~~~~~#    #
      #~~~~~#    #
      #~~~~~#    #
      #~~~~~~~~~~#
      #~~~~~~~~~~#
      ############`);
    const before = w.count('~');
    w.step(1500);
    expect(w.count('~')).toBe(before);
    const left = w.top('~', 1, 5);
    const right = w.top('~', 7, 10);
    expect(right).toBeGreaterThan(0);
    expect(right).toBeLessThan(7); // water climbed into the right arm
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
  });

  it('oil floats on water', () => {
    const w = new World(`
      ##########
      #~~~~~~~~#
      #~~~~~~~~#
      #========#
      #========#
      ##########`);
    w.step(400);
    expect(w.count('=')).toBe(16);
    expect(w.count('~')).toBe(16);
    const lowestOil = Math.max(...w.find('=').map((c) => c.y));
    const highestWater = Math.min(...w.find('~').map((c) => c.y));
    expect(lowestOil).toBeLessThan(highestWater);
  });

  scenario('water pours off a ledge', {
    before: `
      #########
      #~~~    #
      ####    #
      #       #
      #########`,
    ticks: 200,
    expect: (w) => w.count('~') === 3 && w.top('~') === 3,
  });
});

describe('gas: steam and smoke', () => {
  it('steam rises, then condenses back into water', () => {
    const w = new World(`
      ##########
      #        #
      #        #
      #        #
      #        #
      #        #
      #        #
      #        #
      # """""" #
      ##########`);
    w.step(30);
    const steam = w.find('"');
    expect(steam.length).toBe(6);
    const avgY = steam.reduce((s, c) => s + c.y, 0) / steam.length;
    expect(avgY).toBeLessThan(5);
    w.step(400);
    expect(w.count('"')).toBe(0);
    expect(w.count('~')).toBeGreaterThan(0);
    expect(w.reactions('steam>water')).toBeGreaterThan(0);
    // The condensed water fell back to the floor.
    expect(w.top('~')).toBe(8);
  });

  scenario('smoke rises and fades away', {
    before: `
      #######
      #     #
      #     #
      #     #
      # ''' #
      #######`,
    ticks: 300,
    expect: (w) => w.count("'") === 0 && w.reactions('smoke>empty') === 3,
  });

  scenario('steam bubbles up through water', {
    before: `
      #####
      #   #
      # ~ #
      # ~ #
      # " #
      #####`,
    ticks: 60,
    expect: (w) => w.find('"').every((c) => c.y < 3) && w.count('"') + w.count('~') >= 2,
  });
});

describe('fire and reactions', () => {
  scenario('a lone fire burns out within about two seconds', {
    before: `
      #####
      #   #
      # ^ #
      #####`,
    ticks: 130,
    expect: (w) => w.count('^') === 0 && w.reactions('fire>smoke') === 1,
  });

  it('fire and water make steam', () => {
    const w = new World(`
      #######
      #  ~  #
      #  ^  #
      #######`);
    w.step(30);
    expect(w.count('^')).toBe(0);
    expect(w.count('"') + w.count('~')).toBeGreaterThan(1);
    expect(w.reactions('fire+water')).toBe(1);
  });

  it('water splashing from the side quenches fire too', () => {
    const w = new World(`
      #######
      #     #
      #  ^~ #
      #######`);
    w.step(30);
    expect(w.count('^')).toBe(0);
    expect(w.reactions('fire+water')).toBe(1);
  });

  it('water underneath does not quench a flame (burning oil floats)', () => {
    const w = new World(`
      #######
      #  ^  #
      #~~~~~#
      #######`);
    w.step(40);
    expect(w.reactions('fire+water')).toBe(0);
  });

  it('fire spreads along wood and leaves smoke', () => {
    const w = new World(`
      ##############################
      #                            #
      #                            #
      # ^                          #
      #^|||||||||||||||||||||||||| #
      ##############################`);
    const wood = w.count('|');
    let smokeSeen = 0;
    for (let t = 0; t < 2400; t++) {
      w.step();
      smokeSeen = Math.max(smokeSeen, w.count("'"));
    }
    expect(w.count('|')).toBeLessThan(wood / 4);
    expect(w.reactions('fire+wood')).toBeGreaterThan(wood / 2);
    expect(smokeSeen).toBeGreaterThan(0);
  });

  it('wood burns slowly: fire has not crossed the beam in one second', () => {
    const w = new World(`
      ##############################
      #^|||||||||||||||||||||||||| #
      ##############################`);
    w.step(60);
    expect(w.count('|')).toBeGreaterThan(20);
  });

  it('fire races across an oil slick much faster than along wood', () => {
    const w = new World(`
      ##############################
      #                            #
      #^===========================#
      ##############################`);
    w.step(150);
    expect(w.count('=')).toBe(0);
    expect(w.reactions('fire+oil')).toBeGreaterThan(20);
  });

  scenario('burning oil on water burns off and leaves the water', {
    before: `
      ##########
      #^       #
      #========#
      #~~~~~~~~#
      ##########`,
    ticks: 600,
    expect: (w) => w.count('=') === 0 && w.count('~') >= 8 && w.reactions('fire+oil') === 8,
  });
});

describe('determinism', () => {
  const busy = `
    ################################################
    #  ...  ~~~~   ===   """   '''   ^^^   |||    #
    #  ...  ~~~~   ===   """   '''   ^^^   |||    #
    #  ...  ~~~~   ===   """   '''   ^^^   |||    #
    #                                             #
    #   ^ ||||||||||    ~~~~~~~~~~      ......    #
    #     |      ##########################       #
    #     |   ===========                         #
    #  ^  ||||||||||||||||||||                    #
    #                                             #
    ################################################`;

  it('the same seed gives an identical grid after 600 ticks', () => {
    const a = new World(busy, 7).step(600);
    const b = new World(busy, 7).step(600);
    expect(a.toAscii()).toBe(b.toAscii());
    expect(a.hash()).toBe(b.hash());
    expect(Array.from(a.sim.reactionCounts)).toEqual(Array.from(b.sim.reactionCounts));
  });

  it('a different seed gives a different outcome', () => {
    expect(new World(busy, 7).step(600).hash()).not.toBe(new World(busy, 8).step(600).hash());
  });
});

describe('active chunks', () => {
  it('a settled world goes to sleep', () => {
    const w = new World(`
      ########################################
      #                                      #
      #  ....        ~~~~~~                  #
      #                                      #
      ########################################`);
    w.step(400);
    expect(w.sim.activeChunkCount).toBe(0);
    const snapshot = w.toAscii();
    w.step(50);
    expect(w.toAscii()).toBe(snapshot);
  });

  it('editing a sleeping world wakes it', () => {
    const w = new World(`
      ##########
      #        #
      #        #
      ##########`);
    w.step(100);
    expect(w.sim.activeChunkCount).toBe(0);
    w.sim.place(4, 1, 2); // sand
    w.step(5);
    expect(w.at(4, 2)).toBe('.');
  });
});
