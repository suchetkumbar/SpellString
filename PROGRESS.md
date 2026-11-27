# Spellstring: progress log

## M2: The living world (done)

### What changed
- **Material data** (`src/data/materials.ts`): every material now has a density, plus a liquid dispersion, a lifetime range for fire and gases, optional color bands (fire: hot → warm → dying) and a shimmer flag (water).
- **Reactions** (`src/data/reactions.ts`): fully data-driven, each with a stable id for the Codex.
  - Contact reactions (`a` next to `b`, with a per-tick chance) can now limit which side `b` is on, using the new `directions` field.
  - Decay reactions fire when a cell's lifetime ends.
  - Starting set: `fire+water`, `fire+oil`, `fire+wood`, `steam>water`, `fire>smoke` and `smoke>empty`.
- **Lookup tables** (`src/core/materialTable.ts`): flat typed-array tables built from the data, for the hot loop. They validate duplicates and missing decays when loaded.
- **Simulation** (`src/core/sim.ts`):
  - **Two passes per tick:** bottom-to-top for powders, liquids, fire and reactive statics; top-to-bottom for gases. The left/right scan direction alternates every tick, and an updated-this-tick flag stops anything moving twice.
  - **Powder:** falls, slides diagonally, and sinks through lighter liquids (with a 50% chance per tick, so sinking looks slower).
  - **Liquid:** falls, flows diagonally down, and flows sideways only toward a drop within its dispersion range. This lets puddles settle and sleep instead of jittering. Heavier liquids sink below lighter ones.
  - **Communicating vessels:** every N ticks, a blocked surface cell runs a bounded search of its connected body for an empty cell that's strictly lower, and moves there. This makes U-tubes and lakes level out. The search only accepts strictly lower targets, so it can't oscillate.
  - **Gas:** rises with a sideways drift, bubbles up through liquids, lighter gases rise through heavier ones, and it wanders along ceilings. It decays when its lifetime ends.
  - **Fire:** stays in place, reacts with its neighbors and burns out.
  - **Active chunks:** 16×16 chunks. A change wakes the chunk (and its neighbors, if the cell is on a border) for 30 ticks, and only awake chunks update. Chunks also carry a separate *dirty* flag for the renderer.
  - **Reaction counter:** `reactionCounts`, plus an `onReaction` hook that fires the first time each reaction happens (ready for M8).
- **Renderer:**
  - Per-chunk bitmap caching. Only dirty chunks, and chunks holding fire, are redrawn. Only visible chunks are cached, with recycled bitmaps, so memory stays around one screen's worth.
  - Fire is colored by its remaining life and flickers. Water shimmer is a light overlay.
  - F3 outlines simulated chunks and shows how many were simulated and redrawn.
- **Lab mode** (`src/ui/lab.ts`), toggled with **L**:
  - Left mouse paints and right mouse erases. Painting fills only empty or gas cells; hold **Shift** to overwrite.
  - The mouse wheel sets the brush size (0–16), with an outline around the cursor. **1–8** pick the material.
  - **C** clears, **P** pauses (the player can still move), and **N** steps one tick (it pauses first).
  - Strokes are drawn as lines, so fast mouse moves don't leave gaps.
- **Input:** collects mouse-wheel deltas each frame.

### How to try it
- Run `npm run dev`, then press **L**.
- **Burning oil on water:** paint a rock basin (1), fill it with water (3), pour oil (5) on top, and paint fire (4) just above the oil.
- **Burning tower:** paint a wooden tower (6), light its base, and watch it burn into smoke.
- **Steam cycle:** paint steam (7) under a rock ceiling and watch it condense and rain back down.
- Press F3 to see the active chunks go quiet as the world settles.

### Tests
- **Scenario helper** (`tests/helpers/scenario.ts`): `World` builds a world from ASCII and offers `step`, `count`, `find`, `top`, `at`, `reactions(id)`, `toAscii` and `hash`. `scenario(name, { seed, before, ticks, after | expect })` registers a test that checks an exact snapshot or a property.
- **Scenario tests (31, in `tests/unit/materials.test.ts`):**
  - Static rock and wood hold still.
  - A sand grain falls (exact snapshot) and slides off a peak. A column piles into a slope that never changes height by more than one cell per column, with every grain conserved. Sand sinks through water.
  - Water spreads flat, levels out in a U-tube and pours off a ledge. Oil floats on water.
  - Steam rises and then condenses into water that falls back to the floor. Smoke rises and fades. Steam bubbles up through water.
  - Fire burns out into smoke. Fire and water make steam, from above and from the side, but water underneath does not quench a flame.
  - Fire spreads along wood and leaves smoke, but wood burns slowly. Fire races across oil. Burning oil on water burns off completely and leaves the water.
  - Determinism: the same seed gives an identical grid, state hash and reaction counts after 600 ticks of a busy world, and a different seed differs.
  - Active chunks: a settled world sleeps and stays exactly the same, and an edit wakes it.
  - Data integrity: glyphs are unique, ids match array positions, reaction ids are unique and chances are valid probabilities.
- **Robustness:** I ran the stochastic scenarios (U-tube, wood, oil floating, steam, burning oil) across 20–60 seeds while tuning. They all pass with the final numbers.
- **Perf test** (`tests/unit/perf.test.ts`): a busy 256×144 world with 120 blobs of every material, nearly every chunk awake. It logs **about 2.1 ms per tick** on this machine and fails above 25 ms.
- **Playwright:** a new Lab test opens the panel, paints, scrolls the brush size, pauses, steps and clears, with no console errors.

### Performance
- **Worst-case sim** (the busy 256×144 world, about 130 of 144 chunks awake): about 2.1 ms per tick, against a 4 ms budget. The test room runs at 0.1–0.2 ms per tick.
- **Render, measured in headless Chromium without a GPU, so pessimistic:**
  - A dense, zoomed-out 1920×1080 view filled with water: **18.7 ms before chunk caching, about 2.9 ms after** while busy, and 1.2 ms once settled.
  - At zoom 1 in the test room: about 1.3 ms.
- **Profiling:** about 40% of the sim time is the per-cell sweep, and about 8% is the leveling search. If we need headroom later, we can skip the gas pass in chunks with no gas, or level only along a body's edge cells.

### Feel decisions to review
- **Fire+water** turns the *fire cell* into steam and leaves the water in place, rather than turning the water into steam. This still matches "fire + water → steam (the fire dies)", but pools don't get boiled into holes. Only water *above or beside* a flame quenches it (30% per tick). Water underneath doesn't, so burning oil floats and burns across a pool. Fire still dies fast under a water bolt.
- **Wood** catches at 4% per tick per burning neighbor and burns for 240–420 ticks (4–7 s). A 26-cell beam takes about 11 s to burn through. The faster, shorter settings I tried first sometimes broke the chain partway.
- **Oil:** catches at 25% per tick and burns for 40–80 ticks, so a 28-cell slick burns off in about 2.5 s. Its color is brightened from the suggested `#6b3f6e` to `#8a4f8e`, because the suggested color was hard to see on the dark background.
- **Fire life** is 60–120 ticks (1–2 s), and it becomes smoke 40% of the time. Fire doesn't move or rise: a flame painted in mid-air just hangs there and burns out.
- **Steam** lasts 200–340 ticks, then becomes water (75%) or vanishes (25%), so the steam cycle slowly loses water. **Smoke** lasts 90–200 ticks.
- **Liquids don't spread into a film.** A puddle on a flat floor stays a puddle instead of spreading one cell thick forever. Water dispersion is 5 and oil is 3.
- **Leveling** runs every 10 ticks per surface cell and searches up to 160 cells, so very wide lakes level out locally rather than instantly. Surfaces can differ by one cell, as discrete water does.
- **Lab:** painting fills only empty or gas cells unless you hold Shift. This makes it easy to pour water into a basin without erasing the walls.

### Ambiguities resolved
- Out-of-bounds cells act as solid rock, so nothing falls out of the world.
- **Lab mode** for M2 is a toggle (**L**) over the current room. Opening it from the title screen comes with the title screen in M6/M9.
- **Fire** gets its own pass behavior: it doesn't move. Powders and liquids can't displace fire; it acts as an obstacle until it burns out or is quenched.
- **Life 0** means "not started yet", so maps loaded from ASCII get a random lifetime on their first update without consuming the RNG at load time.

### Known issues
- Sand falling onto fire doesn't smother it yet. That's a good candidate for a later `sand+fire` reaction.
- `wake()` keeps a chunk awake for 30 ticks after any change, so busy gas chunks never sleep. That's expected.
- The test room's material strip floats in the air, so it spills on start. It's a visual test room and gets replaced by generated levels in M6.

### Dependencies
No new dependencies.

---

## M1: Skeleton, glyph renderer, game loop (done)

### What changed
- **Project setup:** Vite 8, TypeScript 6 (strict and `noUncheckedIndexedAccess`), ESLint 10 flat config, Vitest 5, Playwright (Chromium).
  - Scripts: `dev`, `build`, `typecheck`, `lint`, `test`, `test:e2e` (builds, then smoke-tests `vite preview`), and `check` (all of them).
- **Lint guards:** in `src/core/**` and `src/game/**`, `Math.random` is banned (`no-restricted-properties`). In `src/core/**`, DOM globals are banned (`window`, `document`, `navigator`, `localStorage`, `requestAnimationFrame`). `tests/unit/lint-rules.test.ts` checks that the rules stay active.
- **`src/core/rng.ts`:** a seeded mulberry32 `Rng` with `next`, `int`, `intRange`, `range`, `chance`, `pick`, save/restore of `state`, and `fork(salt)`. Also `hashString` (FNV-1a, for text and daily seeds) and a pure `hash2(x, y, seed)` for per-cell variation.
- **`src/core/loop.ts`:** `FixedStep`, a 60 Hz accumulator with a catch-up cap (5 steps, then the backlog is dropped and counted), a 250 ms frame clamp and an interpolation `alpha`.
- **`src/core/grid.ts`:** `Grid`, built on typed arrays: `mat`, `life`, `variant` and `flags`. The variant byte is a position hash, used for shade variation.
- **`src/core/ascii.ts` + `src/core/level.ts`:** an ASCII map parser that dedents, trims and pads, and `loadAsciiLevel`. Glyphs map to materials, `@` marks the spawn, and unknown glyphs throw with a line and column.
- **`src/data/`:** `materials.ts` (the 8 starting materials with stable ids, colors and behavior class, ready for M2), `glyphs.ts` (entity glyphs and scene colors), `tuning.ts` (every number has a comment) and `controls.ts` (key bindings by `KeyboardEvent.code`).
- **Rendering (`src/render/`):**
  - `GlyphAtlas` draws each (glyph, color) style once into square tiles at the device-pixel cell size. Cells are blitted with `drawImage`, never `fillText`. Each material gets 4 brightness shades, picked per cell from its variant byte.
  - `Renderer` interface with a `Canvas2DRenderer` implementation; the WebGL post-pass goes behind this interface in M9.
  - `Camera`: smooth exponential follow, clamped to the level (a small level is centered), discrete zoom levels, and a cell size rounded to whole device pixels.
  - The backing store is sized with `devicePixelContentBoxSize` where available (crisp at fractional DPR), and the canvas re-sizes when `devicePixelRatio` changes.
- **Input (`src/input/input.ts`):** held keys, per-frame pressed edges, mouse position and buttons, and the mouse in grid coordinates (`mouseCell`). Keys and buttons are released when the window loses focus. The context menu is suppressed (right click will harvest in M3).
- **Game (`src/game/game.ts`):** `Game.fromAscii(text, seed)`. The player has a continuous position plus `prev` for interpolation. Movement is free 8-directional noclip, clamped to the level. `TickInput` keeps game logic independent of devices and replayable.
- **F3 overlay (`src/ui/debugOverlay.ts`):** fps, worst frame, sim ms per tick, render ms per frame (each shown against its budget), the cell and material under the cursor, player position, zoom, cell size in device pixels, DPR, tick, seed and dropped steps.
- **Test room:** `levels/test-room.txt` (160 × 72), loaded with Vite `?raw`. It holds every starting material, including a color strip on a ledge.
- **Font:** JetBrains Mono Regular and Bold (latin woff2), bundled in `public/fonts/` with `OFL.txt`. The fonts load through the `FontFace` API before the atlas is built, and the game falls back to the system monospace font if loading fails.

### How to try it
- `npm install`, then `npm run dev`, then open the printed URL.
- Use WASD or the arrow keys to fly the `@` around (noclip for now). The camera follows.
- Use `+` / `-` (or the numpad) to zoom, and F3 for the debug overlay. Hover cells to see their material.
- Use browser zoom (Ctrl +/−) or drag the window between monitors to check crispness at other DPRs.
- `npm run check` runs typecheck, lint, the unit tests, the build and the Playwright smoke test.

### Tests
- **Unit tests (32):** PRNG determinism, golden values, uniformity, state save/restore and fork; the fixed-step loop at 60, 144 and 30 Hz, the catch-up cap, the clamp and alpha; ASCII parsing, level loading and its errors; the camera mapping, clamping, zoom and follow; game movement and determinism; the lint rules.
- **Playwright:** the page loads, no console errors appear after 1 s, and the canvas is non-blank (more than 8 distinct colors). F3 toggles the overlay.

### Feel decisions to review
- **Glyph size and weight:** glyphs are 90% of the cell height and bold (700). Square cells with monospace glyphs (about 0.6 em wide) leave visible horizontal gaps, so rock reads as `# # #`. Raising `glyphScale` closes the gaps but crowds the vertical space. Both are in `tuning.ts`.
- **Glyph baseline:** every glyph shares the font's em-box baseline, so `.` sits low in its cell and `'` / `"` sit high, as in a terminal. The alternative is to center each glyph's ink.
- **Zoom levels:** 0.5×, 0.75×, 1×, 1.25×, 1.5×, 2×, 2.5× and 3×. The start is 1× (14 px cells).
- **Camera follow rate:** 8/s (exponential). Lower is floatier.
- **Shade spread:** ±12% brightness over 4 shades.
- **Free-move speed:** 18 cells/s. This is temporary and is replaced by physics in M3.
- **Space** is bound to "up" as well as W and ↑, since it becomes jump in M3.

### Ambiguities resolved
- **Git:** the user handles all git operations, so no repo was initialized and no `M1:` commit was made. `.gitignore` is provided.
- **`src/input/`:** this folder was added for the DOM input manager. It's outside the suggested layout because it isn't UI and isn't core.
- **Map spawn marker:** in ASCII maps, `@` means the player spawn, not a material. That's fine, because `@` is never a material (it's the M7 "self" delivery glyph only inside spells).
- **`Camera` location:** it lives in `src/render` but is pure math (no DOM), so it's unit-tested.
- **Debug overlay:** it's a DOM `<pre>` rather than canvas text, which keeps it crisp and cheap.

### Dependencies
- Dev dependencies only: vite, typescript, vitest, @playwright/test, eslint, @eslint/js, typescript-eslint, globals and @types/node. There are no runtime dependencies.
- The font files were copied once from `@fontsource/jetbrains-mono` (OFL-1.1), and the package was then uninstalled.

### Known issues
- The renderer issues one `drawImage` per non-empty visible cell. That's fine for M1 (about 0.2 ms per frame in the test room), but a fully dense 256 × 144 view at 0.5× zoom should be profiled in M2. Chunk caching is the planned fix if it goes over budget.
- The Playwright smoke test runs Chromium only. Firefox and Safari need manual checks.
- `SPELLSTRING.md` (the spec) isn't in the repo folder yet.
