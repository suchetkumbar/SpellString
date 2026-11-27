import { expect, test } from '@playwright/test';

// The frame budget is measured on the GPU when there is one. Software WebGL is detected by the game
// itself (the CRT pass then falls back to the plain canvas), so without a GPU this measures that path.
test.use({ launchOptions: { args: ['--enable-gpu', '--ignore-gpu-blocklist'] } });

test('every effect on: the frame budget holds through explosions', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('/?level=test');
  await page.waitForFunction(() => window.spellstring?.game?.player.body.grounded === true);
  await page.evaluate(() => {
    const s = window.spellstring!;
    s.settings.update({ crt: true, glow: true, shake: true, hitStop: true, reduceFlashing: false });
    const g = s.game!;
    g.player.hp = 1e9;
    // A gunpowder heap and a burning oil slick right in view.
    const px = Math.floor(g.player.x);
    const py = Math.floor(g.player.y);
    for (let k = 0; k < 5; k++) for (let dx = -(4 - k); dx <= 4 - k; dx++) g.sim.place(px + 10 + dx, py - k, 11);
    for (let dx = 0; dx < 12; dx++) g.sim.place(px - 8 + dx, py - 3, 5);
    g.sim.place(px + 5, py, 4);
    g.sim.place(px - 8, py - 4, 4);
  });
  // Sample frame and render times for two seconds of fire and explosions.
  const samples = await page.evaluate(async () => {
    const out: { frame: number; render: number; sim: number }[] = [];
    const t0 = performance.now();
    while (performance.now() - t0 < 2000) {
      await new Promise((r) => requestAnimationFrame(r));
      out.push({ ...window.spellstring!.perf });
    }
    return out;
  });
  const sorted = (k: 'frame' | 'render' | 'sim') => samples.map((s) => s[k]).sort((a, b) => a - b);
  const p90 = (k: 'frame' | 'render' | 'sim') => sorted(k)[Math.floor(samples.length * 0.9)]!;
  console.log(`[perf e2e] post ${await page.evaluate(() => window.spellstring!.postActive)} · frames ${samples.length} · p90 frame ${p90('frame').toFixed(1)} ms, render ${p90('render').toFixed(1)} ms, sim ${p90('sim').toFixed(1)} ms`);
  // Our own work per frame stays inside 16 ms (headless Chromium renders WebGL in software, so this is generous to the GPU).
  expect(p90('frame')).toBeLessThan(16);
  expect(p90('sim')).toBeLessThan(4);
  expect(errors).toEqual([]);
});
