# Spellstring: progress log

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
