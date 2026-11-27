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
