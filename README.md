# Spellstring

An ASCII falling-sand roguelite. Every character in the world is a simulated
material: sand piles up, water levels out, fire spreads and burns out into
smoke, steam rises and rains back down. You are `@`, a glyph-witch descending
through procedurally generated caves. You pull glyphs out of the world into
your pouch and write them into your wand as spells: `>~^` fires a bolt that
bursts into water and fire at once, and the two react into scalding steam.

Three biomes of two levels each, a Glyph Shrine between levels, and the Wyrm
waiting at the bottom. A run takes about 25 minutes. Death is permanent; the
Reaction Codex remembers everything you discover.

**Play it in your browser:**
- itch.io: **https://thebossyall.itch.io/spellstring**
- GitHub Pages: https://suchetkumbar.github.io/SpellString/

It runs in any desktop browser (Chrome, Firefox or Safari), with a keyboard and
mouse or a gamepad. Press **H** in the game at any time for the controls.

## Playing

```
npm install
npm run dev        # run it locally: http://localhost:5173
```

From the title screen:
- **Enter** to start a run (type a seed first to replay one), or to continue a saved run.
- **D** for the daily run (the same seed for everyone that day).
- **T** for the tutorial.
- **L** for the Lab.
- **C** for the Codex, **S** for settings, **W** to pick an unlocked starting wand.
- **H** for the how-to-play guide. It also opens when the game starts; switch that off in the guide or in Settings.

## Controls

| | Keyboard and mouse | Gamepad |
|---|---|---|
| Move | A / D (or arrows) | left stick or d-pad |
| Jump; swim up | W, Space or Up | A |
| Swim down | S | down |
| Aim | mouse | right stick |
| Cast | left click (hold to repeat) | RT |
| Harvest | hold right click on a material | LT |
| Spell editor (pauses) | Tab | |
| Switch wand | 1, 2, 3 | X, Y, B |
| Zoom | + / − | RB / LB |
| Pause | Esc | Start |
| Codex | C (title or pause) | Back |
| How to play (any time) | H or F1 | |
| Debug overlay | F3 | |

Keys can be rebound in **Settings**. Settings also has the volumes, screen
shake, hit-stop, the CRT/bloom pass, glow, a high-contrast palette and a
reduce-flashing mode.

## Spell cheat sheet

A spell is the string written in your wand, read left to right. Every
character takes a slot (spaces are free). A new delivery glyph starts a new
cast. All the casts fire from one click, a few ticks apart.

**Deliveries** carry the matter that follows them:

| Glyph | Name | Does |
|---|---|---|
| `>` | bolt | flies straight at the cursor |
| `)` | lob | arcs under gravity |
| `@` | self | bursts around you (leaving your own space clear) |
| `_` | mine | sticks where it lands, bursts when a creature comes near |

**Matter** is any material glyph. Each one releases 12 cells and spends one
charge from your pouch. A glyph with no charges *fizzles*, but the rest of the
spell still works.

`#` rock · `.` sand · `~` water · `^` fire · `=` oil · `|` wood · `"` steam ·
`'` smoke · `%` acid · `*` ice · `:` gunpowder · `$` gold (spent from your wallet)

**Modifiers:**

| Glyph | Name | Does |
|---|---|---|
| `+` | split | two more carriers, fanned out (`+>^` = three fire bolts) |
| `2`–`9` | repeat | repeats the matter before it (`~3` = `~~~`); digits save slots, not mana |
| `!` | trigger | when the carrier hits, cast the rest from there (`>!)~5`) |
| `?` | chaos | a random matter glyph you have charges for |
| `[ ]n` | loop | repeat the casts inside n times (`[>.]4`) |

**Mana:** delivery 5, matter 2, `+` 10, `!` 10, `?` 4, each loop 15, summed over
the expanded spell. **Caps per click:** 32 carriers, 400 cells, trigger depth 4.

**Spells to try:** `>~` (put out fires), `>.3` (fill a pit), `>~^` (a steam burst),
`)=3` (an oil slick to light later), `+>^`, `>!)~5`, `_:^` (a gunpowder mine),
`[>.]4` (an instant ramp), `@*3` (an ice shell), `>%` (dig with acid).

## Chemistry

| Reaction | Result |
|---|---|
| `^` + `~` | the fire becomes steam `"` |
| `^` + `=` | the oil catches fire, fast |
| `^` + `\|` | the wood catches fire, slowly |
| `"` | condenses back into water |
| `^` | burns out into smoke `'` |
| `%` + `#` / `\|` / `*` | the acid eats it (four bites per acid cell) |
| `^` + `*` | the ice melts into water |
| `~` + `*` | the water slowly freezes |
| `^` + `:` | **explosion** (bigger with more gunpowder; trails act as fuses) |

## The Wyrm

At the bottom of the descent is a serpent whose body is a string of material
segments: `===^^^~~~###`. It burrows through rock and telegraphs its lunge.
Each segment dies to one reaction:

- `=` oil burns: bring fire.
- `^` fire is quenched: bring water.
- `~` water freezes: bring ice.
- `#` rock dissolves: bring acid.

Explosions hurt every segment they reach. Destroy every segment, then take the
glyph it drops to win the run.

## Development

```
npm run dev          # dev server
npm run check        # typecheck, lint, unit tests, build, browser tests
npm run test         # unit tests (Vitest)
npm run test:e2e     # build + Playwright tests (including the 2-minute bot)
npm run zip          # build and package spellstring-itch.zip for itch.io
```

The simulation, spell language and level generator (`src/core`, `src/game`)
run headless and are fully deterministic for a seed. `Math.random` is banned
there by a lint rule. Content and balance numbers live in `src/data/`.
`PROGRESS.md` has the history of every milestone, with the design decisions
made along the way.

## Publishing

The game is a static site: `npm run build` writes it to `dist/` with relative
paths, so any static host can serve it, from any folder.

**GitHub Pages**, live at https://suchetkumbar.github.io/SpellString/:
`.github/workflows/deploy.yml` runs on every push to `main`. It runs the fast
checks, builds, and publishes `dist/`. The repository's Settings → Pages must have
Source set to "GitHub Actions". Keep this the only Pages workflow: GitHub's
suggested Jekyll and "static content" workflows publish the unbuilt source,
which shows a blank page.

**itch.io**, live at https://thebossyall.itch.io/spellstring: `npm run zip` writes `spellstring-itch.zip`. To update the game, upload the new zip to the project and replace the old file. For a new project, create one
with Kind of project "HTML", upload the zip, tick "This file will be played in
the browser", and set the viewport to 1280 × 720 (or larger).

**Netlify, Vercel or Cloudflare Pages:** build command `npm run build`,
output folder `dist`.

Progress (the Codex, settings, a saved run) lives in the player's browser
storage, per site: it doesn't follow players between hosts.
