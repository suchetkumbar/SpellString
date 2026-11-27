import './style.css';
import testRoom from '../levels/test-room.txt?raw';
import tutorial from '../levels/tutorial.txt?raw';
import { FixedStep } from './core/loop';
import { dailySeed, dayKey, parseSeed, SEED_RANGE } from './core/seeds';
import type { Game, TickInput } from './game/game';
import { Run, type RunMode } from './game/run';
import { TUNING } from './data/tuning';
import { materialDef } from './data/materials';
import { InputManager } from './input/input';
import { Camera, type ViewTransform } from './render/camera';
import { Canvas2DRenderer } from './render/canvas2d';
import { buildStyleTable } from './render/styles';
import { sceneView } from './render/sceneView';
import { Juice } from './render/juice';
import { PostFx } from './render/postfx';
import { DebugOverlay } from './ui/debugOverlay';
import { Lab } from './ui/lab';
import { Hud } from './ui/hud';
import { SpellEditor } from './ui/editor';
import { Screens, type ScreenKind } from './ui/screens';
import { TitleDemo } from './ui/titleDemo';
import { Codex } from './game/codex';
import { Settings, type SettingsData } from './game/settings';
import { browserStore } from './ui/storage';
import { Sound } from './audio/sfx';

declare global {
  interface Window {
    spellstring?: {
      readonly game: Game | null;
      readonly run: Run | null;
      readonly view: ViewTransform | null;
      readonly dpr: number;
      readonly screen: ScreenKind | null;
      readonly settings: Settings;
      /** Is the WebGL pass drawing right now? */
      readonly postActive: boolean;
      /** Recent frame timings (ms): whole frame, sim, render (incl. post). */
      readonly perf: { readonly frame: number; readonly sim: number; readonly render: number };
    };
  }
}

const FONT_FAMILY = '"JetBrains Mono", ui-monospace, monospace';
const LEVELS = { tutorial, testRoom };
/** Explosion light: how long it lasts (ms), its color, and its size relative to the blast. */
const LIGHT_MS = 380;
const LIGHT_RGB = '255, 170, 80';

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

/** A fresh random run seed. (The UI may use Math.random; the simulation never does.) */
function randomSeed(): number {
  return 1 + Math.floor(Math.random() * SEED_RANGE);
}

async function boot(): Promise<void> {
  await loadFonts();

  const store = browserStore();
  const settings = new Settings(store);
  // The Reaction Codex persists in localStorage between runs (and reloads).
  const codex = new Codex(store);

  const canvas = el<HTMLCanvasElement>('game');
  const postCanvas = el<HTMLCanvasElement>('post');
  const debug = new DebugOverlay(el('debug'));
  const lab = new Lab(el('lab'));
  const input = new InputManager(canvas);
  input.bindings = (a) => settings.keysFor(a);
  let styles = buildStyleTable({ highContrast: settings.data.highContrast });
  const renderer = new Canvas2DRenderer(canvas, styles, FONT_FAMILY);
  const camera = new Camera();
  const loop = new FixedStep(TUNING.simHz, TUNING.maxCatchUpSteps);
  const hud = new Hud(el('hud'), el('tip'), el('discover'));
  const hudRoot = el('hud');
  const hintBar = el('hint');
  // Tab pauses the game; on close, drop the time spent in the editor so the sim doesn't catch up.
  const editor = new SpellEditor(el('editor'), () => loop.reset());
  const juice = new Juice({ shake: true, hitStop: true, reduceFlashing: false });
  const sound = new Sound();
  const demo = new TitleDemo();
  const today = new Date();
  /** The WebGL pass, created on first use; null if unavailable (then the plain canvas shows). */
  let post: PostFx | null | undefined;
  let postActive = false;
  const lights: { x: number; y: number; r: number; until: number }[] = [];

  /** Apply settings to every system (on start and whenever they change). */
  const applySettings = (s: SettingsData): void => {
    juice.options = { shake: s.shake, hitStop: s.hitStop, reduceFlashing: s.reduceFlashing };
    sound.setVolumes({ master: s.masterVolume, sfx: s.sfxVolume, ambient: s.ambientVolume });
    renderer.reduceFlashing = s.reduceFlashing;
    const contrast = styles.background === '#000000';
    if (contrast !== s.highContrast) {
      styles = buildStyleTable({ highContrast: s.highContrast });
      renderer.setStyles(styles);
    }
  };
  applySettings(settings.data);
  settings.onChange(applySettings);

  // Browsers only allow audio after a user gesture.
  const unlockAudio = (): void => sound.unlock();
  window.addEventListener('keydown', unlockAudio);
  window.addEventListener('pointerdown', unlockAudio);

  let run: Run | null = null;
  let paused = false;
  let codexOpen = false;
  let settingsOpen = false;

  const startRun = (mode: RunMode, seed: number = randomSeed()): void => {
    editor.close(false);
    const label = mode === 'daily' ? `daily ${dayKey(today)}` : '';
    run = new Run(seed, mode, LEVELS, label, codex);
    codexOpen = false;
    settingsOpen = false;
    lab.setEnabled(mode === 'lab');
    paused = false;
    camera.snapTo(run.game.player.x, run.game.player.y);
    loop.reset();
  };
  const toTitle = (): void => {
    editor.close(false);
    codexOpen = false;
    settingsOpen = false;
    run = null;
    paused = false;
    lab.setEnabled(false);
  };
  /** The same kind of run again: a new seed for random runs, the same one for daily, tutorial and lab. */
  const again = (): void => {
    if (!run) return;
    startRun(run.mode, run.mode === 'run' ? randomSeed() : run.seed);
  };
  const choose = (i: number): void => {
    if (!run || run.phase !== 'shrine') return;
    run.choose(i);
    camera.snapTo(run.game.player.x, run.game.player.y);
    loop.reset();
  };
  const descend = (): void => {
    if (!run) return;
    run.descend();
    camera.snapTo(run.game.player.x, run.game.player.y);
    loop.reset();
  };

  const screens = new Screens(
    el('screen'),
    {
      newRun: (text) => startRun('run', parseSeed(text) ?? randomSeed()),
      daily: () => startRun('daily', dailySeed(today)),
      tutorial: () => startRun('tutorial', 1),
      lab: () => startRun('lab', 1),
      resume: () => {
        paused = false;
        loop.reset();
      },
      again,
      quit: toTitle,
      codex: () => {
        codexOpen = true;
      },
      closeCodex: () => {
        codexOpen = false;
      },
      settings: () => {
        settingsOpen = true;
      },
      closeSettings: () => {
        settingsOpen = false;
      },
      cycleWand: () => {
        codex.cycleStartingWand();
      },
      choose,
      descend,
    },
    { dailyDate: dayKey(today), dailySeed: dailySeed(today) },
    codex,
    settings,
  );

  // URL shortcuts: ?level=test (developer test room), ?seed=N, ?daily, ?tutorial, ?lab.
  const params = new URLSearchParams(location.search);
  if (params.get('level') === 'test') startRun('test', 1);
  else if (params.has('tutorial')) startRun('tutorial', 1);
  else if (params.has('lab')) startRun('lab', 1);
  else if (params.has('daily')) startRun('daily', dailySeed(today));
  else if (params.has('seed')) startRun('run', parseSeed(params.get('seed') ?? '') ?? randomSeed());

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

  // Jump presses and clicks are latched until a tick consumes them, so a press
  // in a frame that runs zero ticks (or a click shorter than a frame) is never lost.
  let jumpLatch = false;
  let castLatch = false;
  let wandLatch = -1;
  let aimX = 0;
  let aimY = 0;
  const readTickInput = (): TickInput => {
    const mouse = input.mouseWorld(renderer.view, dpr);
    const p = run?.game.player;
    if (input.padAim && p) {
      // Right stick: aim up to 10 cells out from the witch.
      aimX = p.x + input.padAim.x * 10;
      aimY = p.y + input.padAim.y * 10;
    } else if (mouse) {
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
      harvest: !lab.enabled && ((input.mouseButtons & 2) !== 0 || input.action('harvest')),
      cast: !lab.enabled && (castLatch || (input.mouseButtons & 1) !== 0 || input.action('cast')),
      wandSlot: wandLatch,
    };
  };

  let lastFrameMs = 0;
  let lastSimMs = 0;
  let lastRenderMs = 0;
  // Read-only debug/test hook (used by Playwright tests and the M10 bot).
  window.spellstring = {
    get game() {
      return run?.game ?? null;
    },
    get run() {
      return run;
    },
    get view() {
      return renderer.view;
    },
    get dpr() {
      return dpr;
    },
    get screen() {
      return screens.current;
    },
    settings,
    get postActive() {
      return postActive;
    },
    get perf() {
      return { frame: lastFrameMs, sim: lastSimMs, render: lastRenderMs };
    },
  };

  /** Which menu (if any) is over the game right now. */
  const screenFor = (): ScreenKind | null => {
    if (settingsOpen) return 'settings';
    if (codexOpen) return 'codex';
    if (!run) return 'title';
    if (run.phase === 'dead') return 'death';
    if (run.phase === 'won') return 'won';
    if (run.phase === 'shrine') return 'shrine';
    return paused ? 'pause' : null;
  };

  /** Keys (and gamepad buttons) for whichever menu is up. */
  const menuKeys = (): void => {
    const kind = screens.current;
    if (kind === 'settings') {
      if (!screens.rebinding && input.actionPressed('pause')) settingsOpen = false;
    } else if (kind === 'title') {
      // (Enter typed into the seed field is handled by the field itself; the game never sees it.)
      if (input.actionPressed('confirm')) startRun('run', parseSeed(screens.seedField?.value ?? '') ?? randomSeed());
      else if (input.wasPressed('KeyD')) startRun('daily', dailySeed(today));
      else if (input.wasPressed('KeyT')) startRun('tutorial', 1);
      else if (input.wasPressed('KeyL')) startRun('lab', 1);
      else if (input.actionPressed('codex')) codexOpen = true;
      else if (input.wasPressed('KeyS')) settingsOpen = true;
      else if (input.wasPressed('KeyW')) codex.cycleStartingWand();
    } else if (kind === 'codex') {
      if (input.actionPressed('pause') || input.actionPressed('codex')) codexOpen = false;
    } else if (kind === 'pause') {
      if (input.actionPressed('pause')) {
        paused = false;
        loop.reset();
      } else if (input.wasPressed('KeyR')) again();
      else if (input.wasPressed('KeyQ')) toTitle();
      else if (input.actionPressed('codex')) codexOpen = true;
      else if (input.wasPressed('KeyS')) settingsOpen = true;
    } else if (kind === 'shrine' && run) {
      if (run.shrinePicks > 0 && input.actionPressed('confirm')) descend();
      const picks = ['wand1', 'wand2', 'wand3'] as const;
      for (let i = 0; i < 3; i++) {
        if (input.actionPressed(picks[i]!) || input.wasPressed(`Numpad${i + 1}`)) {
          choose(i);
          break;
        }
      }
    } else if (kind === 'death' || kind === 'won') {
      if (input.actionPressed('restart')) {
        if (run?.mode === 'tutorial' && kind === 'won') startRun('run');
        else again();
      } else if (input.wasPressed('KeyC')) screens.copy();
      else if (input.actionPressed('pause')) toTitle();
    }
  };

  /** Show the 2D canvas through the WebGL pass (if wanted and available), else plainly. */
  const present = (): void => {
    const want = settings.data.crt;
    if (want && post === undefined) post = PostFx.create(postCanvas);
    postActive = want && !!post;
    postCanvas.hidden = !postActive;
    canvas.style.opacity = postActive ? '0' : '1';
    if (postActive) post!.render(canvas, true);
  };

  let last = performance.now();
  let lastDebugDraw = 0;

  const frame = (now: number): void => {
    const frameStart = performance.now();
    const dt = Math.min(now - last, 250);
    last = now;
    input.pollGamepad();

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

    const shownBefore = screens.current;
    if (shownBefore) menuKeys();
    else if (run && !editor.isOpen && input.actionPressed('pause')) paused = true;
    screens.show(screenFor(), run);
    hudRoot.hidden = run === null;
    hintBar.hidden = screens.current !== null;

    const current: Run | null = run;
    if (!current) {
      // Title: a living backdrop behind the menu.
      demo.step();
      camera.snapTo(demo.grid.width / 2, demo.grid.height / 2);
      renderer.render({
        grid: demo.grid,
        camera,
        entities: [],
        cursor: null,
        timeMs: now,
        chunks: { shift: demo.sim.chunkShift, chunksX: demo.sim.chunksX, dirty: demo.sim.chunkDirty, active: demo.sim.chunkActive },
        glow: settings.data.glow,
      });
      present();
      sound.ambience(null, 0, 0, false);
      input.endFrame();
      requestAnimationFrame(frame);
      return;
    }
    const game = current.game;
    const playing = current.phase === 'level' && !paused;

    // Spell editor: Tab toggles (writing the spell), Esc cancels. The game is paused while it's open.
    if (playing && input.actionPressed('editor')) {
      if (editor.isOpen) editor.close(true);
      else if (!game.player.dead) editor.open(game);
    } else if (editor.isOpen && input.actionPressed('pause')) {
      editor.close(false);
    }
    if (!playing && editor.isOpen) editor.close(false);
    const running = playing && !editor.isOpen;

    // Lab edits apply between ticks, using last frame's view for the mouse cell.
    const labAllowed = current.mode === 'lab' || current.mode === 'test';
    const labSteps = running ? lab.update(input, game, input.mouseCell(renderer.view, dpr), labAllowed) : 0;

    if (input.actionPressed('jump')) jumpLatch = true;
    if (running && (input.mousePressed & 1) !== 0) castLatch = true;
    // Wand keys (1-3, or as rebound; in Lab mode the number keys pick materials instead).
    if (running && !lab.enabled) {
      if (input.actionPressed('wand1')) wandLatch = 0;
      else if (input.actionPressed('wand2')) wandLatch = 1;
      else if (input.actionPressed('wand3')) wandLatch = 2;
    }

    // Fixed-timestep simulation (held still during hit-stop).
    const steps = running && !juice.stopping ? loop.advance(dt) : 0;
    const simStart = performance.now();
    const simulateWorld = !(lab.enabled && lab.paused);
    for (let i = 0; i < steps && current.phase === 'level'; i++) {
      current.step(readTickInput(), simulateWorld);
      jumpLatch = false;
      castLatch = false;
      wandLatch = -1;
    }
    for (let i = 0; i < labSteps; i++) game.sim.step();
    const simMs = performance.now() - simStart;

    // The level may have just ended (exit or death): draw the level it ended in.
    const shown = current.game;
    // Feel: sounds, shake, hit-stop and explosion light from this frame's events.
    for (const e of shown.events.splice(0)) {
      juice.feed(e);
      sound.play(e);
      if (e.kind === 'explode') lights.push({ x: e.x, y: e.y, r: e.r * 2.2, until: now + LIGHT_MS });
    }
    for (let i = lights.length - 1; i >= 0; i--) if (lights[i]!.until <= now) lights.splice(i, 1);
    const shake = juice.update(dt);
    camera.shakeX = shake.x;
    camera.shakeY = shake.y;
    sound.ambience(current.biome?.key ?? null, shown.nearbyFire, shown.nearbyAcid, shown.harvester.active);

    const a = running ? loop.alpha : 1;
    const reduce = settings.data.reduceFlashing;
    const scene = sceneView(shown, styles, a, now, reduce);
    const p = shown.player;
    const lead = TUNING.cameraLeadSeconds;
    camera.follow(scene.px + p.body.vx * lead, scene.py + p.body.vy * lead * 0.5, dt / 1000);

    const h = shown.harvester;
    const renderStart = performance.now();
    const cursor = input.mouseCell(renderer.view, dpr);
    renderer.render({
      grid: shown.grid,
      camera,
      entities: scene.entities,
      harvestRing: h.active ? { x: h.centerX, y: h.centerY, radius: TUNING.harvestRadius, full: h.full } : undefined,
      cursor,
      timeMs: now,
      brushRadius: lab.enabled ? lab.brush : 0,
      chunks: {
        shift: shown.sim.chunkShift,
        chunksX: shown.sim.chunksX,
        dirty: shown.sim.chunkDirty,
        active: shown.sim.chunkActive,
      },
      showActiveChunks: debug.visible,
      labels: scene.labels,
      glow: settings.data.glow,
      lights: lights.map((l) => ({ x: l.x, y: l.y, r: l.r, rgb: LIGHT_RGB, alpha: (reduce ? 0.3 : 0.65) * Math.max(0, (l.until - now) / LIGHT_MS) })),
      flash: reduce ? 0 : juice.flash,
    });
    present();
    const renderMs = performance.now() - renderStart;
    hud.update(shown, current);

    debug.record(now, dt, steps + labSteps, simMs, renderMs);
    lastSimMs = simMs;
    lastRenderMs = renderMs;
    if (now - lastDebugDraw >= TUNING.debugRefreshMs) {
      lastDebugDraw = now;
      let cursorText = 'cursor  -';
      if (cursor && shown.grid.inBounds(cursor.x, cursor.y)) {
        const m = materialDef(shown.grid.get(cursor.x, cursor.y));
        const life = shown.grid.life[shown.grid.index(cursor.x, cursor.y)] ?? 0;
        cursorText = `cursor  ${cursor.x},${cursor.y}  ${m ? `${m.name} '${m.glyph}'` : '?'}${life ? `  life ${life}` : ''}`;
      }
      debug.draw([
        cursorText,
        `player  ${p.x.toFixed(2)},${p.y.toFixed(2)}  v ${p.body.vx.toFixed(1)},${p.body.vy.toFixed(1)}${p.body.grounded ? '  grounded' : ''}`,
        `zoom    ${camera.zoom}x  cell ${camera.cellDevicePx(dpr)} dpx  dpr ${dpr}  post ${postActive ? 'on' : 'off'}`,
        `run     ${current.mode}  seed ${current.seed}  level seed ${shown.seed}  depth ${current.depth}/${current.totalLevels}`,
        `tick    ${shown.tick}  dropped ${loop.droppedSteps}  creatures ${shown.creatures.length}`,
        `chunks  ${shown.sim.activeChunkCount}/${shown.sim.chunkActive.length} simulated (outlined), ${renderer.chunksRedrawn} redrawn`,
      ]);
    }

    input.endFrame();
    lastFrameMs = performance.now() - frameStart;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

boot().catch((err: unknown) => {
  console.error('Spellstring failed to start', err);
});
