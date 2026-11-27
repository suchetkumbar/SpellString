import { expect, test } from '@playwright/test';

// Measured on the GPU when there is one (the game itself skips software WebGL).
test.use({ launchOptions: { args: ['--enable-gpu', '--ignore-gpu-blocklist'] } });

/** mulberry32: the bot's choices are seeded, so a failure can be replayed. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BOT_SEED = Number(process.env.BOT_SEED ?? 2026);
const DURATION_MS = Number(process.env.BOT_MS ?? 120_000);
/** After this long on a level the bot steps onto the exit, so two minutes cover the shrines, a save and the Wyrm's lair. */
const WARP_MS = Number(process.env.BOT_WARP_MS ?? 10_000);
const SPELLS = ['>', '>~', '>^', '>.3', '>~^', ')=3', '+>^', '>!)~', '_:^', '[>.]3', '@*', '>?', '>%', '>$'];

test('bot: two minutes of a seeded run, moving and casting at random, with no errors and frames in budget', async ({ page }) => {
  test.setTimeout(DURATION_MS + 60_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  const r = rng(BOT_SEED);
  await page.goto(`/?seed=${BOT_SEED}`);
  await page.waitForFunction(() => window.spellstring?.game?.player.body.grounded === true);
  // Give the bot something to cast with: charges and every glyph, as if it had played a while.
  const arm = () =>
    page.evaluate(() => {
      const g = window.spellstring!.game!;
      for (const m of [2, 3, 4, 5, 9, 10, 11, 12]) g.pouch.add(m, 30);
      for (const ch of ['>', ')', '+', '@', '_', '!', '?', '[', ']']) g.known.add(ch);
    });
  await arm();
  const box = (await page.locator('#game').boundingBox())!;
  const keys = ['KeyA', 'KeyD', 'KeyW', 'KeyS'];
  const held = new Set<string>();
  const t0 = Date.now();
  let actions = 0;
  let deaths = 0;
  let levels = 0;
  let lastGame: unknown = null;
  let levelStart = Date.now();
  let saves = 0;
  let lairs = 0;
  while (Date.now() - t0 < DURATION_MS) {
    const screen = await page.evaluate(() => window.spellstring!.screen);
    if (screen === 'death' || screen === 'won') {
      deaths++;
      for (const k of held) await page.keyboard.up(k);
      held.clear();
      await page.keyboard.press('KeyR');
      await page.waitForTimeout(300);
      await arm();
      continue;
    }
    if (screen === 'title') {
      // Back from a save-and-quit: Enter continues the saved run.
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
      continue;
    }
    if (screen === 'shrine') {
      levels++;
      if (levels === 2) {
        // Once per bot run: save and quit here, then continue from the title.
        saves++;
        await page.keyboard.press('KeyQ');
        await page.waitForTimeout(200);
        continue;
      }
      await page.keyboard.press(`Digit${1 + Math.floor(r() * 3)}`);
      await page.waitForTimeout(150);
      if ((await page.evaluate(() => window.spellstring!.screen)) === 'shrine') await page.keyboard.press('Enter');
      await page.waitForTimeout(150);
      continue;
    }
    if (screen !== null) {
      await page.keyboard.press('Escape');
      continue;
    }
    const game = await page.evaluate(() => window.spellstring!.game!.seed);
    if (game !== lastGame) {
      lastGame = game;
      levelStart = Date.now();
      if (await page.evaluate(() => window.spellstring!.run?.isBossLevel === true)) lairs++;
      await arm();
    }
    if (Date.now() - levelStart > WARP_MS) {
      levelStart = Date.now();
      await page.evaluate(() => {
        const g = window.spellstring!.game!;
        const e = g.features.portal;
        if (!e) return;
        g.player.body.x = e.x + 0.5;
        g.player.body.y = e.y + 0.5;
      });
    }
    const roll = r();
    actions++;
    if (roll < 0.35) {
      // Hold or release a movement key.
      const k = keys[Math.floor(r() * keys.length)]!;
      if (held.has(k)) {
        await page.keyboard.up(k);
        held.delete(k);
      } else {
        await page.keyboard.down(k);
        held.add(k);
      }
    } else if (roll < 0.75) {
      // Aim somewhere and cast.
      await page.mouse.move(box.x + r() * box.width, box.y + r() * box.height);
      await page.mouse.down();
      await page.waitForTimeout(30 + r() * 200);
      await page.mouse.up();
    } else if (roll < 0.85) {
      // Harvest whatever is under a random spot.
      await page.mouse.move(box.x + r() * box.width, box.y + r() * box.height);
      await page.mouse.down({ button: 'right' });
      await page.waitForTimeout(100 + r() * 500);
      await page.mouse.up({ button: 'right' });
    } else if (roll < 0.9) {
      // Write a random spell.
      await page.keyboard.press('Tab');
      await page.waitForTimeout(80);
      await page.keyboard.type(SPELLS[Math.floor(r() * SPELLS.length)]!);
      await page.keyboard.press('Enter');
    } else if (roll < 0.93) {
      await page.keyboard.press(`Digit${1 + Math.floor(r() * 3)}`);
    } else {
      await page.keyboard.press('Space');
    }
    await page.waitForTimeout(40 + r() * 160);
  }
  for (const k of held) await page.keyboard.up(k);

  // Frame timings over the last few seconds of play.
  const samples = await page.evaluate(async () => {
    const out: { frame: number; sim: number }[] = [];
    const s = performance.now();
    while (performance.now() - s < 3000) {
      await new Promise((res) => requestAnimationFrame(res));
      out.push({ frame: window.spellstring!.perf.frame, sim: window.spellstring!.perf.sim });
    }
    return out;
  });
  const p90 = (k: 'frame' | 'sim') => samples.map((x) => x[k]).sort((a, b) => a - b)[Math.floor(samples.length * 0.9)]!;
  const tick = await page.evaluate(() => window.spellstring!.game?.tick ?? 0);
  console.log(
    `[bot] seed ${BOT_SEED}: ${actions} actions, ${deaths} deaths/wins, ${levels} shrines, ${saves} saves, ${lairs} lairs, post ${await page.evaluate(() => window.spellstring!.postActive)}, p90 frame ${p90('frame').toFixed(1)} ms, sim ${p90('sim').toFixed(1)} ms, tick ${tick}`,
  );
  expect(errors).toEqual([]);
  expect(actions).toBeGreaterThan(100);
  expect(levels).toBeGreaterThan(0);
  expect(p90('frame')).toBeLessThan(16);
  expect(p90('sim')).toBeLessThan(4);
});
