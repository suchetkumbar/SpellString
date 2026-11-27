import './style.css';
import testRoom from '../levels/test-room.txt?raw';
import { FixedStep } from './core/loop';
import { Game, type TickInput } from './game/game';
import { TUNING } from './data/tuning';
import { materialDef } from './data/materials';
import { InputManager } from './input/input';
import { Camera } from './render/camera';
import { Canvas2DRenderer } from './render/canvas2d';
import { buildStyleTable } from './render/styles';
import { DebugOverlay } from './ui/debugOverlay';

const FONT_FAMILY = '"JetBrains Mono", ui-monospace, monospace';
const DEFAULT_SEED = 1;

async function loadFonts(): Promise<void> {
  const base = import.meta.env.BASE_URL;
  const faces = [
    new FontFace('JetBrains Mono', `url(${base}fonts/JetBrainsMono-Regular.woff2)`, { weight: '400' }),
    new FontFace('JetBrains Mono', `url(${base}fonts/JetBrainsMono-Bold.woff2)`, { weight: '700' }),
  ];
  try {
    await Promise.all(
      faces.map(async (f) => {
        await f.load();
        document.fonts.add(f);
      }),
    );
  } catch (err) {
    // Fall back to the system monospace font rather than refusing to start.
    console.warn('Spellstring: could not load bundled font, using system monospace.', err);
  }
}

function el<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`Missing #${id}`);
  return e as T;
}

async function boot(): Promise<void> {
  await loadFonts();

  const canvas = el<HTMLCanvasElement>('game');
  const debug = new DebugOverlay(el('debug'));
  const input = new InputManager(canvas);
  const styles = buildStyleTable();
  const renderer = new Canvas2DRenderer(canvas, styles, FONT_FAMILY);
  const camera = new Camera();
  const loop = new FixedStep(TUNING.simHz, TUNING.maxCatchUpSteps);
  const game = Game.fromAscii(testRoom, DEFAULT_SEED);
  camera.snapTo(game.player.x, game.player.y);

  // Keep the backing store exactly device-pixel sized so glyphs stay crisp.
  let deviceW = 0;
  let deviceH = 0;
  let dpr = window.devicePixelRatio || 1;
  const applySize = (): void => renderer.resize(deviceW, deviceH, dpr);
  const observer = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (!entry) return;
    dpr = window.devicePixelRatio || 1;
    const box = entry.devicePixelContentBoxSize?.[0];
    if (box) {
      deviceW = box.inlineSize;
      deviceH = box.blockSize;
    } else {
      deviceW = Math.round(entry.contentRect.width * dpr);
      deviceH = Math.round(entry.contentRect.height * dpr);
    }
    applySize();
  });
  try {
    observer.observe(canvas, { box: 'device-pixel-content-box' });
  } catch {
    observer.observe(canvas); // Safari: no device-pixel-content-box support.
  }
  deviceW = Math.round(canvas.clientWidth * dpr);
  deviceH = Math.round(canvas.clientHeight * dpr);
  applySize();

  const readTickInput = (): TickInput => ({
    moveX: input.axis('left', 'right'),
    moveY: input.axis('up', 'down'),
  });

  let last = performance.now();
  let lastDebugDraw = 0;

  const frame = (now: number): void => {
    const dt = Math.min(now - last, 250);
    last = now;

    // Per-frame (non-simulation) controls.
    if (input.actionPressed('debug')) debug.toggle();
    if (input.actionPressed('zoomIn')) camera.zoomBy(1);
    if (input.actionPressed('zoomOut')) camera.zoomBy(-1);
    const liveDpr = window.devicePixelRatio || 1;
    if (liveDpr !== dpr) {
      // Browser zoom / monitor change: ResizeObserver also fires, but rescale now to avoid a blurry frame.
      deviceW = Math.round((deviceW / dpr) * liveDpr);
      deviceH = Math.round((deviceH / dpr) * liveDpr);
      dpr = liveDpr;
      applySize();
    }

    // Fixed-timestep simulation.
    const steps = loop.advance(dt);
    const simStart = performance.now();
    const tickInput = readTickInput();
    for (let i = 0; i < steps; i++) game.step(tickInput);
    const simMs = performance.now() - simStart;

    // Interpolate entities between ticks.
    const a = loop.alpha;
    const p = game.player;
    const px = p.prevX + (p.x - p.prevX) * a;
    const py = p.prevY + (p.y - p.prevY) * a;
    camera.follow(px, py, dt / 1000);

    const renderStart = performance.now();
    const cursor = input.mouseCell(renderer.view, dpr);
    renderer.render({
      grid: game.grid,
      camera,
      entities: [{ style: styles.entity.player, x: px, y: py }],
      cursor,
    });
    const renderMs = performance.now() - renderStart;

    debug.record(now, dt, steps, simMs, renderMs);
    if (now - lastDebugDraw >= TUNING.debugRefreshMs) {
      lastDebugDraw = now;
      let cursorText = 'cursor  -';
      if (cursor && game.grid.inBounds(cursor.x, cursor.y)) {
        const m = materialDef(game.grid.get(cursor.x, cursor.y));
        cursorText = `cursor  ${cursor.x},${cursor.y}  ${m ? `${m.name} '${m.glyph}'` : '?'}`;
      }
      debug.draw([
        cursorText,
        `player  ${p.x.toFixed(2)},${p.y.toFixed(2)}`,
        `zoom    ${camera.zoom}x  cell ${camera.cellDevicePx(dpr)} dpx  dpr ${dpr}`,
        `tick    ${game.tick}  seed ${game.seed}  dropped ${loop.droppedSteps}`,
      ]);
    }

    input.endFrame();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

boot().catch((err: unknown) => {
  console.error('Spellstring failed to start', err);
});
