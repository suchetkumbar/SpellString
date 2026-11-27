import { expect, test } from '@playwright/test';

test('loads with no console errors and draws a non-blank canvas', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/');
  await page.waitForTimeout(1000);

  const stats = await page.evaluate(() => {
    const canvas = document.getElementById('game') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { width: 0, height: 0, colors: 0 };
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const colors = new Set<number>();
    for (let i = 0; i < data.length; i += 4 * 7) {
      colors.add(((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0));
      if (colors.size > 64) break;
    }
    return { width: canvas.width, height: canvas.height, colors: colors.size };
  });

  expect(errors).toEqual([]);
  expect(stats.width).toBeGreaterThan(0);
  expect(stats.height).toBeGreaterThan(0);
  // The background alone is 1-2 colors; drawn glyphs add many more.
  expect(stats.colors).toBeGreaterThan(8);
});

test('F3 toggles the debug overlay', async ({ page }) => {
  await page.goto('/');
  const overlay = page.locator('#debug');
  await expect(overlay).toBeHidden();
  await page.waitForTimeout(300);
  await page.keyboard.press('F3');
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText('fps');
  await expect(overlay).toContainText('sim');
});

test('Lab mode: L opens the panel, painting and lab keys raise no errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('/');
  await page.waitForTimeout(300);
  const lab = page.locator('#lab');
  await expect(lab).toBeHidden();
  await page.keyboard.press('KeyL');
  await expect(lab).toBeVisible();
  await expect(lab).toContainText('sand');

  await page.keyboard.press('Digit3'); // water
  await page.mouse.move(400, 200);
  await page.mouse.down();
  await page.mouse.move(500, 220, { steps: 5 });
  await page.mouse.up();
  await page.mouse.wheel(0, -300);
  await page.keyboard.press('KeyP');
  await expect(lab).toContainText('PAUSED');
  await page.keyboard.press('KeyN');
  await page.keyboard.press('KeyC');
  await page.waitForTimeout(300);
  expect(errors).toEqual([]);
});

test('the witch walks and jumps, harvests, dies and restarts', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.goto('/');
  await page.waitForFunction(() => window.spellstring?.game.player.body.grounded === true);
  const x0 = await page.evaluate(() => window.spellstring!.game.player.x);
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(400);
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
  const midJump = await page.evaluate(() => window.spellstring!.game.player.body.grounded);
  await page.keyboard.up('KeyD');
  expect(midJump).toBe(false);
  expect(await page.evaluate(() => window.spellstring!.game.player.x)).toBeGreaterThan(x0 + 2);

  // Harvest: hold right click on the ledge the witch stands on (rock digs slowly).
  await page.waitForTimeout(600);
  const target = await page.evaluate(() => {
    const s = window.spellstring!;
    const p = s.game.player;
    const v = s.view!;
    const wx = p.x;
    const wy = p.y + 1.2; // the cell under her feet
    return { x: (v.originX + wx * v.cell) / s.dpr, y: (v.originY + wy * v.cell) / s.dpr };
  });
  const box = (await page.locator('#game').boundingBox())!;
  await page.mouse.move(box.x + target.x, box.y + target.y);
  await page.mouse.down({ button: 'right' });
  await page.waitForTimeout(1500);
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(800);
  const charges = await page.evaluate(() => Array.from(window.spellstring!.game.pouch.counts).reduce((a, b) => a + b, 0));
  expect(charges, `harvest near ${JSON.stringify(target)}`).toBeGreaterThan(0);
  await expect(page.locator('#hud')).toContainText('HP');

  // Death and instant restart.
  await page.evaluate(() => {
    window.spellstring!.game.player.burning = 1_000_000;
    window.spellstring!.game.player.hp = 1;
  });
  await expect(page.locator('#death')).toBeVisible();
  await expect(page.locator('#death')).toContainText('killed by: ^');
  const t0 = Date.now();
  await page.keyboard.press('KeyR');
  await expect(page.locator('#death')).toBeHidden();
  expect(Date.now() - t0).toBeLessThan(3000);
  expect(await page.evaluate(() => window.spellstring!.game.player.dead)).toBe(false);
  expect(errors).toEqual([]);
});
