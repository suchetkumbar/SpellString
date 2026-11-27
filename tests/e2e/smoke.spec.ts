import { expect, test } from '@playwright/test';

test('loads with no console errors and draws a non-blank canvas', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/?level=test');
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
  await page.goto('/?level=test');
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
  await page.goto('/?level=test');
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
  await page.goto('/?level=test');
  await page.waitForFunction(() => window.spellstring?.game?.player.body.grounded === true);
  const x0 = await page.evaluate(() => window.spellstring!.game!.player.x);
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(400);
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
  const midJump = await page.evaluate(() => window.spellstring!.game!.player.body.grounded);
  await page.keyboard.up('KeyD');
  expect(midJump).toBe(false);
  expect(await page.evaluate(() => window.spellstring!.game!.player.x)).toBeGreaterThan(x0 + 2);

  // Harvest: hold right click on the ledge the witch stands on (rock digs slowly).
  await page.waitForTimeout(600);
  const target = await page.evaluate(() => {
    const s = window.spellstring!;
    const p = s.game!.player;
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
  const charges = await page.evaluate(() => Array.from(window.spellstring!.game!.pouch.counts).reduce((a, b) => a + b, 0));
  expect(charges, `harvest near ${JSON.stringify(target)}`).toBeGreaterThan(0);
  await expect(page.locator('#hud')).toContainText('HP');

  // Death and instant restart.
  await page.evaluate(() => {
    window.spellstring!.game!.player.burning = 1_000_000;
    window.spellstring!.game!.player.hp = 1;
  });
  await expect(page.locator('#screen')).toBeVisible();
  await expect(page.locator('#screen')).toContainText('killed by: ^ (burning)');
  const t0 = Date.now();
  await page.keyboard.press('KeyR');
  await expect(page.locator('#screen')).toBeHidden();
  expect(Date.now() - t0).toBeLessThan(3000);
  expect(await page.evaluate(() => window.spellstring!.game!.player.dead)).toBe(false);
  expect(errors).toEqual([]);
});

test('spell editor: Tab pauses, only owned glyphs type, paste highlights, Enter writes, click casts', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.goto('/?level=test');
  await page.waitForFunction(() => window.spellstring?.game?.player.body.grounded === true);
  await expect(page.locator('#hud')).toContainText('WAND');

  const editor = page.locator('#editor');
  const field = page.locator('#spell-input');
  await expect(editor).toBeHidden();
  await page.keyboard.press('Tab');
  await expect(editor).toBeVisible();
  await expect(field).toHaveValue('>');

  // Paused: no ticks while the editor is open.
  const t0 = await page.evaluate(() => window.spellstring!.game!.tick);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.spellstring!.game!.tick)).toBe(t0);

  // Water was never harvested, so typing it is refused (the selected text is replaced by '>').
  await page.keyboard.type('>~');
  await expect(field).toHaveValue('>');
  await expect(editor).toContainText('never collected');
  await page.keyboard.press('Escape');
  await expect(editor).toBeHidden();

  // Paste goes through, with the missing glyph highlighted and an error.
  await page.keyboard.press('Tab');
  await expect(editor).toBeVisible();
  await field.evaluate((input) => {
    const data = new DataTransfer();
    data.setData('text/plain', '>^');
    input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(field).toHaveValue('>^');
  await expect(page.locator('#editor .spell-slot.missing')).toHaveCount(1);
  await expect(editor).toContainText('harvest some first');
  await page.keyboard.press('Escape');

  // Once water is owned (as if harvested), >~3 types, shows its cost, and Enter writes it.
  await page.evaluate(() => window.spellstring!.game!.pouch.add(3, 20));
  await page.keyboard.press('Tab');
  await expect(editor).toBeVisible();
  await page.keyboard.type('>~3');
  await expect(field).toHaveValue('>~3');
  await expect(editor).toContainText('cost 11 MP');
  await page.keyboard.press('Enter');
  await expect(editor).toBeHidden();
  expect(await page.evaluate(() => window.spellstring!.game!.wand.spell.text)).toBe('>~3');
  await expect(page.locator('#hud .hud-wand')).toContainText('~');

  // Left click casts: three water charges spent, and the game is running again.
  const box = (await page.locator('#game').boundingBox())!;
  const aim = await page.evaluate(() => {
    const s = window.spellstring!;
    const p = s.game!.player;
    const v = s.view!;
    return { x: (v.originX + (p.x + 8) * v.cell) / s.dpr, y: (v.originY + (p.y - 2) * v.cell) / s.dpr };
  });
  await page.mouse.click(box.x + aim.x, box.y + aim.y);
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.spellstring!.game!.pouch.count(3))).toBe(17);
  expect(await page.evaluate(() => window.spellstring!.game!.tick)).toBeGreaterThan(t0 + 10);
  expect(errors).toEqual([]);
});

test('creatures: the room has them, and a bolt hurts one with a floating number', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.goto('/?level=test');
  await page.waitForFunction(() => window.spellstring?.game?.player.body.grounded === true);
  expect(await page.evaluate(() => window.spellstring!.game!.creatures.length)).toBeGreaterThanOrEqual(5);

  // A golem right next to the witch (slow, with a long windup before it can punch). Let it land, then aim.
  const id = await page.evaluate(() => {
    const g = window.spellstring!.game!;
    return g.spawnCreature('golem', g.player.x + 5, g.player.y - 0.5).id;
  });
  await page.waitForFunction((gid) => window.spellstring!.game!.creatures.find((c) => c.id === gid)?.body.grounded === true, id);
  const target = await page.evaluate((gid) => {
    const s = window.spellstring!;
    const golem = s.game!.creatures.find((c) => c.id === gid)!;
    const v = s.view!;
    return { id: gid, x: (v.originX + golem.x * v.cell) / s.dpr, y: (v.originY + golem.y * v.cell) / s.dpr };
  }, id);
  const box = (await page.locator('#game').boundingBox())!;
  await page.mouse.click(box.x + target.x, box.y + target.y);
  // Hit: it lost HP, and a damage number floated up.
  await expect
    .poll(
      () =>
        page.evaluate((id) => {
          const g = window.spellstring!.game!;
          const golem = g.creatures.find((c) => c.id === id);
          return golem !== undefined && golem.hp < golem.maxHp;
        }, target.id),
      { timeout: 3000 },
    )
    .toBe(true);
  expect(await page.evaluate(() => window.spellstring!.game!.effects.texts.length)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('run flow: title, a generated level, the shrine, death with a postcard, and a new run in under 3 s', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.goto('/');
  const screen = page.locator('#screen');
  await expect(screen).toBeVisible();
  await expect(screen).toContainText('new run');
  await expect(screen).toContainText('daily run');

  // Start a seeded run from the title's seed field.
  await page.locator('.screen-seed').fill('48213');
  await page.locator('.screen-seed').press('Enter');
  await expect(screen).toBeHidden();
  await expect(page.locator('#hud')).toContainText('Sandstone Hollows 1-1 · seed 48213');
  await page.waitForFunction(() => (window.spellstring?.game?.tick ?? 0) > 30);

  // Reach the exit: the Glyph Shrine offers three gifts; take the first.
  await page.evaluate(() => {
    const g = window.spellstring!.game!;
    const exit = g.features.portal!;
    g.player.body.x = exit.x + 0.5;
    g.player.body.y = exit.y + 0.5;
  });
  await expect(screen).toContainText('GLYPH SHRINE');
  await expect(page.locator('.shrine-card')).toHaveCount(3);
  await page.keyboard.press('Digit1');
  await expect(screen).toBeHidden();
  await expect(page.locator('#hud')).toContainText('Sandstone Hollows 1-2');

  // Esc pauses; Esc resumes.
  await page.keyboard.press('Escape');
  await expect(screen).toContainText('PAUSED');
  await page.keyboard.press('Escape');
  await expect(screen).toBeHidden();

  // Death: the postcard, then R starts a new run within 3 seconds.
  await page.evaluate(() => {
    window.spellstring!.game!.player.burning = 1_000_000;
    window.spellstring!.game!.player.hp = 1;
  });
  await expect(screen).toContainText('YOU DIED');
  const postcard = await page.locator('.postcard').inputValue();
  expect(postcard).toContain('SPELLSTRING  seed 48213  depth 2/6');
  expect(postcard).toContain('killed by: ^ (burning)');
  expect(postcard).toContain('reactions found:');
  const t0 = Date.now();
  await page.keyboard.press('KeyR');
  await expect(screen).toBeHidden();
  await page.waitForFunction(() => window.spellstring?.run?.depth === 1 && window.spellstring?.game?.player.dead === false);
  expect(Date.now() - t0).toBeLessThan(3000);

  // Back to the title, then the tutorial and the daily run.
  await page.keyboard.press('Escape');
  await expect(screen).toContainText('PAUSED');
  await page.keyboard.press('KeyQ');
  await expect(screen).toContainText('tutorial');
  await page.keyboard.press('KeyT');
  await expect(page.locator('#hud')).toContainText('Tutorial');
  await expect(page.locator('#tip')).toContainText('A / D');
  await page.keyboard.press('Escape');
  await expect(screen).toContainText('PAUSED');
  await page.keyboard.press('KeyQ');
  await expect(screen).toContainText('daily run');
  await page.keyboard.press('KeyD');
  await expect(page.locator('#hud')).toContainText('Sandstone Hollows 1-1');
  expect(await page.evaluate(() => window.spellstring!.run!.label)).toMatch(/^daily \d{4}-\d{2}-\d{2}$/);
  expect(errors).toEqual([]);
});
