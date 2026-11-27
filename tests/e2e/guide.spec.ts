import { expect, test } from '@playwright/test';

// A first-time player: nothing saved yet.
test.use({ storageState: { cookies: [], origins: [] } });

test('the guide opens at start, pauses play when opened with H, and can be turned off', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('/');
  await expect(page.locator('.guide')).toBeVisible();
  await expect(page.locator('#screen')).toContainText('HOW TO PLAY');
  // The loop, the controls (from the current bindings) and the glyphs are all there.
  for (const text of ['Harvest', 'Write', 'Cast', 'React', 'right click', 'switch wand', 'Spell glyphs', 'trigger']) {
    await expect(page.locator('.guide')).toContainText(text);
  }
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.spellstring?.screen === 'title');

  // In a run, H opens it over the game and holds the game still.
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.spellstring?.game?.player.body.grounded === true);
  await page.keyboard.press('KeyH');
  await page.waitForFunction(() => window.spellstring!.screen === 'guide');
  await expect(page.locator('.guide')).toContainText('back to the game');
  const t1 = await page.evaluate(() => window.spellstring!.game!.tick);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.spellstring!.game!.tick)).toBe(t1);
  await page.keyboard.press('KeyH');
  await page.waitForFunction(() => window.spellstring!.screen === null);
  await page.waitForFunction((t) => window.spellstring!.game!.tick > t, t1);

  // Rebinding a key shows up in the guide.
  await page.evaluate(() => window.spellstring!.settings.rebind('jump', 'KeyK'));
  await page.keyboard.press('KeyH');
  await expect(page.locator('.guide-row', { hasText: 'jump, swim up' })).toContainText('K');

  // Turn off "show at start": the next visit starts at the title.
  await page.locator('.guide-toggle').click();
  await expect(page.locator('.guide-toggle')).toContainText('[ ]');
  await page.goto('/');
  await page.waitForFunction(() => window.spellstring?.screen === 'title');
  expect(errors).toEqual([]);
});

test('a shared seed link opens the guide over a held run', async ({ page }) => {
  await page.goto('/?seed=7');
  await page.waitForFunction(() => window.spellstring?.screen === 'guide' && window.spellstring.game !== null);
  const t = await page.evaluate(() => window.spellstring!.game!.tick);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.spellstring!.game!.tick)).toBe(t);
  await page.keyboard.press('Enter');
  await page.waitForFunction((t0) => window.spellstring!.screen === null && window.spellstring!.game!.tick > t0, t);
});
