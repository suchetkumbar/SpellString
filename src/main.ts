import './style.css';
import testRoom from '../levels/test-room.txt?raw';
import { FixedStep } from './core/loop';
import { Game, type TickInput } from './game/game';
import { TUNING } from './data/tuning';
import { materialDef } from './data/materials';
import { InputManager } from './input/input';
import { Camera, type ViewTransform } from './render/camera';
import { Canvas2DRenderer } from './render/canvas2d';
import { buildStyleTable } from './render/styles';
import { DebugOverlay } from './ui/debugOverlay';
import { Lab } from './ui/lab';
import { Hud } from './ui/hud';
import type { RenderEntity } from './render/renderer';

declare global {
  interface Window {
    spellstring?: { readonly game: Game; readonly view: ViewTransform | null; readonly dpr: number };
  }
}

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
  const lab = new Lab(el('lab'));
  const input = new InputManager(canvas);
  const styles = buildStyleTable();
  const renderer = new Canvas2DRenderer(canvas, styles, FONT_FAMILY);
  const camera = new Camera();
  const loop = new FixedStep(TUNING.simHz, TUNING.maxCatchUpSteps);
  const hud = new Hud(el('hud'), el('death'));
  let seed = DEFAULT_SEED;
  let game = Game.fromAscii(testRoom, seed);
  camera.snapTo(game.player.x, game.player.y);
  /** Instant restart: a fresh copy of the room, next seed. */
  const restart = (): void => {
    seed++;
    game = Game.fromAscii(testRoom, seed);
    camera.snapTo(game.player.x, game.player.y);
    loop.reset();
  };

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

  // Jump presses are latched until a tick consumes them, so a press in a frame
  // that runs zero ticks is never lost.
  let jumpLatch = false;
  let aimX = 0;
  let aimY = 0;
  const readTickInput = (): TickInput => {
    const mouse = input.mouseWorld(renderer.view, dpr);
    if (mouse) {
      aimX = mouse.x;
      aimY = mouse.y;
    }
    return {
      moveX: input.axis('left', 'right'),
      moveY: input.action('down') ? 1 : 0,
      jumpPressed: jumpLatch,
      jumpHeld: input.action('jump'),
      aimX,
      aimY,
      harvest: !lab.enabled && (input.mouseButtons & 2) !== 0,
    };
  };

  // Read-only debug/test hook (used by Playwright tests and the M10 bot).
  window.spellstring = {
    get game() {
      return game;
    },
    get view() {
      return renderer.view;
    },
    get dpr() {
      return dpr;
    },
  };

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

    // Lab edits apply between ticks, using last frame's view for the mouse cell.
    const labSteps = lab.update(input, game.sim, input.mouseCell(renderer.view, dpr));

    if (game.player.dead && input.actionPressed('restart')) restart();
    if (input.actionPressed('jump')) jumpLatch = true;

    // Fixed-timestep simulation.
    const steps = loop.advance(dt);
    const simStart = performance.now();
    const simulateWorld = !(lab.enabled && lab.paused);
    for (let i = 0; i < steps; i++) {
      game.step(readTickInput(), simulateWorld);
      jumpLatch = false;
    }
    for (let i = 0; i < labSteps; i++) game.sim.step();
    const simMs = performance.now() - simStart;

    // Interpolate entities between ticks.
    const a = loop.alpha;
    const p = game.player;
    const px = p.prevX + (p.x - p.prevX) * a;
    const py = p.prevY + (p.y - p.prevY) * a;
    const lead = TUNING.cameraLeadSeconds;
    camera.follow(px + p.body.vx * lead, py + p.body.vy * lead * 0.5, dt / 1000);

    const entities: RenderEntity[] = [];
    for (const g of game.harvester.particles) {
      entities.push({
        style: (styles.materialFirst[g.material] as number) + styles.shades - 1,
        x: g.prevX + (g.x - g.prevX) * a,
        y: g.prevY + (g.y - g.prevY) * a,
      });
    }
    const e = styles.entity;
    const look = p.dead
      ? e.playerDead
      : p.burning > 0 && (now >> 6) % 2 === 0
        ? e.playerBurning
        : p.scalded > 0
          ? e.playerScalded
          : p.hurtThisTick > 0
            ? e.playerHurt
            : e.player;
    entities.push({ style: look, x: px, y: py });
    const h = game.harvester;

    const renderStart = performance.now();
    const cursor = input.mouseCell(renderer.view, dpr);
    renderer.render({
      grid: game.grid,
      camera,
      entities,
      harvestRing: h.active ? { x: h.centerX, y: h.centerY, radius: TUNING.harvestRadius, full: h.full } : undefined,
      cursor,
      timeMs: now,
      brushRadius: lab.enabled ? lab.brush : 0,
      chunks: {
        shift: game.sim.chunkShift,
        chunksX: game.sim.chunksX,
        dirty: game.sim.chunkDirty,
        active: game.sim.chunkActive,
      },
      showActiveChunks: debug.visible,
    });
    const renderMs = performance.now() - renderStart;
    hud.update(game);

    debug.record(now, dt, steps + labSteps, simMs, renderMs);
    if (now - lastDebugDraw >= TUNING.debugRefreshMs) {
      lastDebugDraw = now;
      let cursorText = 'cursor  -';
      if (cursor && game.grid.inBounds(cursor.x, cursor.y)) {
        const m = materialDef(game.grid.get(cursor.x, cursor.y));
        const life = game.grid.life[game.grid.index(cursor.x, cursor.y)] ?? 0;
        cursorText = `cursor  ${cursor.x},${cursor.y}  ${m ? `${m.name} '${m.glyph}'` : '?'}${life ? `  life ${life}` : ''}`;
      }
      debug.draw([
        cursorText,
        `player  ${p.x.toFixed(2)},${p.y.toFixed(2)}  v ${p.body.vx.toFixed(1)},${p.body.vy.toFixed(1)}${p.body.grounded ? '  grounded' : ''}`,
        `zoom    ${camera.zoom}x  cell ${camera.cellDevicePx(dpr)} dpx  dpr ${dpr}`,
        `tick    ${game.tick}  seed ${game.seed}  dropped ${loop.droppedSteps}`,
        `chunks  ${game.sim.activeChunkCount}/${game.sim.chunkActive.length} simulated (outlined), ${renderer.chunksRedrawn} redrawn`,
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
