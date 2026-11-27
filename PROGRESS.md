# Spellstring: progress log

## M9: Juice and sound (done)

### What changed
- **Game events** (`GameContext.emit`, `Game.events`): the simulation reports what happened each tick for the feel layer:
  - cast (with its delivery), impact, splash, explode (with its radius), hurt, hit, kill, death, fizzle
  - sizzle (fire meeting water), discover, chest, portal

  Nothing in the simulation reads them, and they're capped at 256 so a headless game never grows.
- **Screen shake and hit-stop** (`src/render/juice.ts`):
  - **Shake** uses trauma (squared) with smooth sine noise, decaying at 1.8/s. Explosions shake by size, then come blows on the witch, kills and creature hits; kinetic impacts barely shake.
  - **Hit-stop** freezes the simulation for 45–160 ms on blows, kills, explosions and death.
  - **Explosions flash** the screen briefly.
  - Each has an off switch. The shake only moves the camera's view, never the game.
- **Glow** on fire, acid and explosions (in the 2D renderer, so it works without WebGL): emissive cells go into a one-pixel-per-cell image, which is blurred at low resolution and added on top. Explosions also add a short warm radial light.
- **WebGL bloom + CRT pass** (`src/render/postfx.ts`): the 2D canvas is shown through a shader with bloom (an 8-tap ring blur of the bright parts), fine scanlines, a vignette and slight colour fringing. It has an off switch. **It falls back to the plain canvas** when WebGL is missing *or is software-emulated* (SwiftShader, llvmpipe), where it would cost far more than it's worth.
- **Per-material effects:**
  - Water, oil and acid **shimmer**, fire **flickers** through its colour bands, and gold and ice **glint**.
  - Impacts throw **small glyph debris** (half-size glyphs of what burst) that arcs and falls.
- **Sound** (`src/audio/sfx.ts`): everything is synthesised with WebAudio, with no audio files.
  - **Casting:** one sound per delivery glyph (`>` zap, `)` thwup, `@` pulse, `_` double click).
  - **Effects:** impacts, splash, sizzle, an explosion (noise plus a sub thump), hurt, hit, kill, death, fizzle, discovery chime, chest arpeggio and portal sweep.
  - **Loops:** harvest suction while right click is held, and fire crackle and acid bubbling scaled by how much is near the witch.
  - **Ambience per biome:** a noise bed (the Hollows low, the Tar Pits lower with bubbles, the Vaults airy with rare chimes).

  Audio starts on the first key or click, as browsers require.
- **The title screen** now has a living backdrop: a small simulated cave behind the menu, with sand pouring, water running, oil and a fire burning.
- **Settings** (`src/game/settings.ts`, saved as `spellstring.settings.v1`, with bad values falling back to defaults):
  - **Settings screen:** **S** on the title or in the pause menu.
  - **Volume:** master, effects and ambience.
  - **Toggles:** screen shake, hit-stop, CRT + bloom, glow, high-contrast palette and reduce flashing.
  - **Key remapping:** click an action, press a key; Esc cancels. Gamepad bindings are kept. There's also "reset keys".
- **High-contrast palette:** brighter colours with no per-cell shading on pure black. It swaps in live.
- **Reduce flashing:**
  - Flicker off: fire, the burning witch, burning creatures, the portal and mines all hold steady.
  - Blinks off: the hurt flash and the i-frame blink are gone.
  - Telegraphs stay a steady red with the `!`.
  - No screen flash, and explosion lights are dimmer.
- **Gamepad** (standard mapping, polled each frame): buttons become `Pad*` codes, so bindings, menus and remapping all work the same way.
  - **Movement:** left stick or d-pad moves; A jumps (and confirms in menus).
  - **Aiming and casting:** the right stick aims up to 10 cells out; RT casts and LT harvests.
  - **Wands:** X, Y and B switch wands and pick shrine gifts.
  - **Other buttons:** LB/RB zoom, Start pauses, Back opens the Codex.
- **New actions** (`src/data/controls.ts`): confirm, cast, harvest, wand1–3, codex. Wand keys go through bindings now, so they can be remapped.
- **Debug hook:** `window.spellstring` now exposes `settings`, `postActive` and `perf` (the latest frame, sim and render ms) for tests.

### How to try it
1. Run `npm run dev`, then click or press a key to start sound.
2. In Lab (L on the title), paint gunpowder and light it: shake, flash, light and a thump.
3. Settings (**S**): turn things off one by one. Try high contrast and reduce flashing during a firestorm. Rebind jump.
4. Plug in a gamepad and play a run with it.

### Tests (230 unit, 11 e2e)
- **Settings:** persist across a reload with mocked storage (including rebinding, which keeps the pad button), fall back to defaults on missing, corrupt or out-of-range values, and notify listeners.
- **Juice:** shake and hit-stop on explosions, settling back to zero. **With every switch off: no shake, no hit-stop, no flash.**
- **High contrast:** a black background and flat shades.
- **Game events:** cast, impact and a single death are reported, as are explosions (with radius) and sizzles. The event list stays bounded.
- **Playwright:**
  - **Settings** changed on the screen, including a rebind, **survive a fresh page load**.
  - **The performance budget with every effect on** (CRT, glow, shake, explosions and burning oil in view): p90 frame **2.3 ms**, render 1.8 ms, sim 0.4 ms at 60 fps, on this machine's integrated Intel Iris Xe. The test asks for the GPU; on a machine without one, the game's fallback is what gets measured.
  - A **stubbed gamepad** starts a run with A, walks with the stick and casts with RT.
  - **The smoke tests all pass.**

### Feel decisions to review
- **Shake:** maximum offset 0.9 cells at full trauma. An explosion adds 0.3 + 0.07 × radius; a blow on the witch adds 0.25 plus up to 0.35 more.
- **Hit-stop:** blow 70 ms, kill 45 ms, explosion 80 ms, death 160 ms.
- **Glow strength:** 55% additive. Explosion light lasts 0.38 s at 2.2× the blast radius.
- **CRT:** subtle by design (7% scanlines, a soft vignette). Bloom only lifts what's brighter than mid grey.
- **Sound:** deliberately small and chippy, and every sound has a cooldown so bursts stay readable. Default volumes are 70% master, 80% effects and 50% ambience.

### Ambiguities resolved (please check)
- **"Falls back to the plain canvas"** also covers software WebGL. It's detected and skipped, because a CPU-rendered CRT pass dropped headless Chromium to 9 fps.
- **The glow lives in the 2D renderer**, so it works (and has its own switch) whether or not the WebGL pass runs.
- **What can be remapped:** movement, jump, swim down, editor, wands 1–3, zoom and restart. Menu keys stay fixed (Esc, Enter, the letters shown in brackets).

### Known issues
- **Audio isn't unit-tested.** Node has no WebAudio; the browser tests confirm it runs without errors.
- **Gamepad users can't type spells:** the editor needs a keyboard. A glyph picker for pads would be a later addition.
- **Rebinding doesn't check for conflicts:** one key can end up bound to two actions.

### Dependencies
No new dependencies.

---

## M8: The Reaction Codex (done)

### What changed
- **Persistence:** `KeyValueStore` (`src/core/storage.ts`) is a three-method interface with an in-memory version for tests. `browserStore()` (`src/ui/storage.ts`) wraps `localStorage`, never throws, and falls back to memory if storage is blocked. The Codex is saved under `spellstring.codex.v1` on every change (it's small, and changes are rare). Corrupt, foreign or older data starts a fresh Codex, and unknown ids are dropped.
- **The Codex** (`src/game/codex.ts`, headless):
  - **What it records:** discoveries in four kinds (12 reactions, 12 materials, 5 creatures, 8 spell glyphs), the spell journal (total casts per spell, and the last 20 run endings with the spell in hand), the run count, and the chosen starting wand.
  - **Formulas** show only what a reaction *makes*: `^ + = -> ^` (oil catches fire), `^ + ~ -> "`, `" -> ~`, `% + # -> ·` (acid eats rock), `^ + : -> *boom*`.
- **Discovery tracking** (in `Game`, when it has a Codex):
  - **Reactions:** the first time each happens, via the sim's existing first-reaction hook.
  - **Materials:** on screen near the witch (48 × 28 cells), or once harvested.
  - **Creatures:** within 20 cells.
  - **Glyphs:** once owned.

  Each new one raises a **DISCOVERED** banner with its formula or name (top right, about 3 s), and an **UNLOCKED** banner when it earns an unlock.
- **Light meta-progression** (`src/data/unlocks.ts`), options only, never stats:
  - **Shrine glyphs:** `)`, `+`, `@` and `_` are always offered.
    - **`!` trigger** unlocks after 6 reactions.
    - **`?` chaos** unlocks after 10 materials.
    - **`[ ]n` loop** unlocks after 10 reactions.
  - **Starting wands**, chosen on the title with **W**:
    - **Lobber's** starts knowing `)`; unlocked by meeting 3 kinds of creature.
    - **Splitter's** starts knowing `+`; unlocked by 5 reactions.
    - **Sapper's** starts knowing `_`; unlocked by seeing gunpowder explode.

    They all have identical stats and an empty pouch (a test checks this). **Daily runs always use the plain wand**, so they stay fair.
- **Spell journal:** at the end of each run (death or win), its casts and ending are recorded. The Codex screen shows the 8 most-cast spells and the 8 latest runs (seed, depth, ending, the spell in hand, the best spell).
- **The Codex screen:** **C** on the title or in the pause menu; Esc goes back.
  - **Counts and entries:** each section shows how many you've found ("Reactions 7/12") and lists every entry, with `???` for the ones you haven't.
  - **Unlocks** show ✓ when earned, or ○ with how to earn them.
  - **The journal** sits at the bottom.

  The title shows codex progress ("4/12 reactions · 1/6 unlocks") and the starting wand.
- **Lab mode** now hands you **a wand with every glyph you've discovered**, a full pouch of the materials you've discovered, and three wands. The developer test room (`?level=test`) still has everything.

### How to try it
1. Play the tutorial (**T**). DISCOVERED banners appear as you meet water, rock, steam and the gate's reactions.
2. Back on the title, press **C** for the Codex. Reload the page: it's still there.
3. Meet bats, slimes and a toad across runs to unlock Lobber's wand, then pick it with **W**.

### Tests (221 unit, 8 e2e)
- **Persistence (mocked storage):**
  - Discoveries, the journal and the starting-wand choice survive a "reload" (a new Codex on the same store).
  - Missing, corrupt and foreign data, and unknown ids, all start clean.
  - The journal keeps the latest 20 runs and sums casts.
- **Formulas:** every reaction's text checked, plus material, creature and glyph names.
- **Unlock rules:**
  - **Every unlock opens exactly when its requirement is met** (one short is still locked), and `discover()` reports it as newly earned.
  - Shrine glyph gating.
  - Starting wands (plain always; others when unlocked; the choice persists).
  - **Unlocks never change stats.**
- **In play:** seeing a bat, water and fire meeting yields discoveries and banners. A Codex-backed run never offers `! ? [` before they're unlocked, records its ending in the journal on death, honours the starting wand (and dailies ignore it), and Lab gets only discovered glyphs and materials.
- **Playwright:** the tutorial raises a DISCOVERED banner. After a fresh page load the title's Codex shows the same material count and lists `#  rock`.

### Feel decisions to review
- **Thresholds:** 6 / 10 reactions, 10 materials, 3 creatures, 5 reactions for Splitter's.
  - **Run 1:** the tutorial alone gives about 4 reactions (the fire gate's fire, steam and smoke).
  - **Runs 1–2:** Hollows plus Tar Pits bring oil and wood fires and the first three creatures. Splitter's and Lobber's should land here.
  - **Later:** `!` needs Tar Pits, and `[ ]` needs Vaults chemistry.
- **"Seeing" a material** means it's within roughly the visible area around the witch (48 × 28 cells), checked 4 times a second.
- **Banners:** at most two at a time, each up for about 3.3 s.

### Ambiguities resolved (please check)
- **Discovering a glyph** means owning it: learning it at a shrine, or harvesting a matter glyph. Simply seeing one on a creature doesn't count.
- **The journal's "spell equipped when each run ended"** is the spell in the wand in hand at death or victory.
- **Lab, first time:** with an empty Codex, Lab gives just `>`. Lab grows as you play, as the spec says.
- **Unlocked starting wands** apply to normal runs, not daily runs or the tutorial.

### Known issues
- There's no "reset Codex" button yet. Clear site data, or `localStorage.removeItem('spellstring.codex.v1')`, to start over.
- Discoveries in the developer test room (`?level=test`) aren't recorded on purpose. Discoveries in Lab are.

### Dependencies
No new dependencies.

---

## M7: Spells v2 and new chemistry (done)

### What changed
- **New spell glyphs** (all now offered at Glyph Shrines):
  - **`@` self:** releases right where it's cast, leaving the witch's own cells clear, so `@*3` builds an ice shell *around* her. With no payload it's a shockwave (radius 3.5) that hurts and shoves creatures away. `@` fired by a trigger releases around the impact point.
  - **`_` mine:** flies a short arc (speed 26, gravity 30), **sticks to the first surface it hits**, and bursts when a creature comes within about a cell. It also bursts when it flies straight into a creature, when an explosion reaches it, or after 60 s. A kinetic mine is a small shockwave. Mines never go off on the witch.
  - **`!` trigger:** when any carrier bursts (impact, end of range, mine, `@`), the rest of its group is cast from that point along the carrier's direction. Charges are spent then, so fizzles still apply. Every carrier triggers, so `+>!>` makes 6 carriers.
  - **`?` chaos:** each carrier draws a random matter glyph you have charges for, at cast time.
  - **`[ ... ]n` loops:** learning `[` teaches `]` too.
  - The plan's caps (32 carriers, 400 cells, trigger depth 4) cover triggers and loops; the M4 interpreter already enforced them.
- **New materials** (`src/data/materials.ts`, `reactions.ts`):
  - **`%` acid:** a liquid heavier than water. It eats rock, wood and ice, **4 bites per acid cell**, then it's spent. The bite count lives in the cell's life byte (new reaction field `aUses`). It hurts the witch (18/s) and creatures (golems 45/s) and is spent by them too: one touching cell every 8 ticks of contact.
  - **`*` ice:** static and brittle. **Fire melts it** into water. **Water touching it slowly freezes** (chance 0.0015 per tick per contact).
  - **`:` gunpowder:** a powder. **Fire sets it off** (new reaction field `explode`).
  - **`$` gold:** the heaviest powder. It is harvested into the **wallet** (cap 999, separate from the 50-per-material pouch).
- **Explosions** (`Simulation.explode`, `src/game/explosions.ts`):
  - All gunpowder connected to the blast point within 4 cells goes up together, so the radius grows with the amount: 2.5 + 0.8·√n, capped at 9.
  - Inside the radius, brittle cells shatter (wood, ice, sand; never rock), empty space catches fire, and water flashes to steam.
  - **Gunpowder up to 1.5 cells beyond the radius is lit too**, so trails work as fuses and caches chain.
  - Bodies in range take up to 40 damage and a push of up to 34 cells/s, both falling off to the edge. Stuck mines in range go off. Blasts after your own fire count as **"your own explosion"**.
- **Sim change:** a contact pair that matches but misses its dice roll now keeps its chunk awake, so slow reactions (freezing, acid) carry on while the rest of the map sleeps. Measured on generated levels this costs almost nothing: 0.04–0.06 ms/tick, with 0–2 chunks awake.
- **Gold:**
  - **Spending:** writing `$` into a spell spends gold. The shot hits hard (heavy impact 15 per `$`, ×2.5 on golems) but drops only 3 nuggets (new material field `burstCells`), so you can't just harvest it back.
  - **Where it's found:** every biome now has sealed gold veins and small nugget piles, and chests can hold gold.
  - **The HUD** shows the wallet as `$ n` in the pouch line.
- **Up to three wands** (keys 1–3, via `TickInput.wandSlot`, so switching is replayable):
  - Every wand regenerates and finishes its current spell in the background, and the HUD lists them all with the one in hand marked.
  - Shrines can offer a **new wand**: Quick (3 slots, fast recharge), Deep (6 slots, 160 MP, slow) or Twin (a second starter wand).
  - Wand upgrades apply to the wand in hand.
  - Lab starts with three wands.
- **Shrine extras:** the first gift is free, and **each extra costs 25 gold**. With gold left to spend the shrine stays open, and **Enter descends**.
- **Frozen Vaults** (levels 5–6): rock facing open air is crusted with ice (45%), **the main route's bridges are ice**, and there are gunpowder caches and piles, acid pockets, water pools (which slowly freeze against the crust), and gold. Creatures are golems, imps and bats. A descent is now 6 levels.
- **Lab:** all 12 materials. Keys 1–9 and 0 pick the first ten, and `[` and `]` step through all of them. The test room has ice, gunpowder and gold on its shelf, and an acid cup (which slowly eats its way down).

### How to try it
1. Lab (title screen, **L**) has every glyph, a full pouch and three wands. Press Tab and try:
   - `>!)~5` at a wall.
   - `_:^` aimed at the floor, then lure something over it (or spawn one with J/K).
   - `[>.]4` for an instant ramp.
   - `@*3` to wall yourself in ice.
   - `>%` to dig with acid.
   - `>$` at a golem.
2. Paint a gunpowder trail in Lab (`:` is key 1–0 or `[`/`]`), touch fire to one end, and watch it chain.
3. In a run, collect gold, then take two gifts at a shrine.

### Tests (210 unit, 7 e2e)
- **Chemistry** (`chemistry2.test.ts`), one scenario per new reaction:
  - **Acid:** it eats exactly 36 rock cells for 9 acid cells, then is spent. It eats wood and ice at 4 bites. It hurts the witch and is used up.
  - **Ice:** fire melts it, and water freezes on it slowly but surely (even after the pool settles).
  - **Explosions:**
    - Radius exactly 2.5 + 0.8·√25 for a 25-grain pile.
    - Brittle cells shatter and rock doesn't.
    - **A gunpowder fuse chains** into several blasts.
    - **Push and damage** fall off with distance and miss bodies outside the radius.
    - "your own explosion".
  - **Gold:** wallet cap, and it sinks through water.
- **Spells** (`spells2.test.ts`):
  - **Interpreter:** chaos placeholders, loops of triggers, `@` and `_` plans.
  - **`>!)~5`:** the lob is launched from the far wall and 60 water cells land.
  - **`_:^`:** it sticks, waits, then goes up when a slime comes by.
  - **`[>.]4`:** 4 launches and 48 sand.
  - **`@*3`:** an ice shell with her own cells clear.
  - Kinetic `@` shoves; `?` draws from the charges you have; `+>!>` makes 6 carriers.
  - **Caps at runtime:** `[[+>]9]9` stops at 32 carriers with a "cut off" warning, quickly.
- **Wands and shrines:** switching keeps each wand's spell and mana; shrines offer new wands (capped at 3); `>$` spends gold, drops 3 nuggets and deals heavy damage; and the shrine's free gift, then paid gifts, then automatic descent.
- **The Vaults** generate with ice, gunpowder, gold and their creatures.
- **Earlier tests:** the 500-seed connectivity test now covers all three biomes, and every earlier test still passes (descents are now 6 levels).

### Feel decisions to review
- **Acid:** 4 bites per cell at chance 0.06 (rock) or 0.12 (wood and ice) per tick. A `>%` bolt (12 cells) digs about 48 cells of rock in a few seconds. That makes it a strong digging tool, so watch whether it trivializes levels.
- **Freezing at 0.0015:** a small pool freezes over in roughly half a minute of contact with ice.
- **Explosions:** 40 damage and 34 cells/s push at the centre. One `_:^` mine (12 gunpowder + 12 fire) makes a radius of about 5.
- **Mines** trigger within about a cell of a creature and last 60 s.
- **Gold:** a `$` shot deals 18 (45 to golems). Extra shrine gifts cost 25.
- **Wand templates:** Quick 3 slots / 7-tick recharge, Deep 6 slots / 160 MP / 32-tick recharge, Twin = a starter wand.

### Ambiguities resolved (please check)
- **Acid's limited bites** are one count per acid cell (4), whatever it eats.
- **`@` releases around the caster, not on her.** Without that, `@*3` would entomb her.
- **Triggers fire on any burst**, including the end of a bolt's range and a mine going off, and every carrier of a `+` fan triggers.
- **Mines are creature-triggered only**, as the spec says; the witch can walk over her own.
- **Gold in a spell** is spent like any charge (one per `$`). It is deliberately a poor way to move gold around (3 nuggets back for 1 gold).
- **The wallet** is the gold slot of the pouch, with its own cap.

### Known issues
- `>%` may be too good at digging, and `@*3` makes you briefly invulnerable to walkers. Both are playtest questions.
- Pools in the Vaults freeze for good, so water can become scarce late in a level (harvest early, or melt ice with fire).
- The acid cup in the test room slowly eats away the floor below it (working as designed, but noisy for M2-style testing).

### Dependencies
No new dependencies.

---

## M6: Caves and the descent (done)

### What changed
- **Level generator** (`src/core/levelgen.ts`, headless, seeded):
  1. **Cave shape:** two octaves of value noise, thresholded, then 4 passes of cellular-automata smoothing. Each biome sets the scale and openness.
  2. **A meandering main route** from spawn (left) to exit (right) is carved into the noise *before* smoothing, so it reads as part of the cave. Its waypoints are 20–36 columns apart and at most 10 rows up or down from each other. Its floor drops are bridged with wood only where the dip is deeper than 2 cells (a dip of 1–2 cells you just walk into). Side caverns branch off everywhere.
  3. **Furnishing from the biome** (`src/data/biomes.ts`):
     - Pockets of sand, water or oil sealed inside rock, which spill when you dig into them.
     - Pools flood-filled into floor basins, skipping basins that leak or are too big.
     - Stable 45° sand piles.
     - Wooden planks with posts. They never cross the route.
     - Fire vents.
  4. **The connectivity guarantee:** `src/core/reach.ts` models where the witch can actually go: walk, step up, fall, jump 4 cells up while drifting 3 sideways, swim, and leap 3 cells out of a pool. If the exit isn't reachable, a walkable tunnel (climbing at most 3 cells per column) is carved from the reachable cell nearest the exit, with a spawn-to-exit tunnel as the last resort. Loose material near the tunnel is sealed so nothing pours in. Thanks to the main route, only about 1 level in 500 needs the tunnel.
  5. **Glyph chests** are placed on reachable floors well off the main route.
  6. **Creatures** are bought from a difficulty budget: base + 4 per level of depth. Costs are bat 1, slime 2, toad 3, imp 3, golem 5. Walkers start on floors and fliers in open air, at least 28 cells from the spawn.
- **Biomes:**
  - **Sandstone Hollows:** sand and water, pools, sand piles, scaffolds. Bats and slimes.
  - **Tar Pits:** bigger caverns, oil pockets and lakes, more bridges, and 4 fire vents. Toads, imps and a few bats.
- **Level features** (`src/game/features.ts`):
  - **Exit portal `O`:** touch it to finish the level.
  - **Glyph chest `&`:** walk into it and two materials (12–20 charges each) fly out into your pouch as glyphs.
  - **Fire vent `≡`:** a floor strip that keeps a 4–6 cell gate of fire burning forever, **until water reaches its mouth**. Then it hisses out for good and the fire turns to steam.
- **The run** (`src/game/run.ts`, headless):
  - A descent is 4 levels (Hollows 1-1, 1-2, Tar Pits 2-1, 2-2). The count comes from the biome data, so M7's Frozen Vaults makes it 6.
  - Level seeds derive from the run seed and depth.
  - HP, pouch, wand, known glyphs and run stats carry between levels.
  - Reaching the last exit ends the run ("the descent goes on" until the boss arrives in M10).
- **The Glyph Shrine** (between levels):
  - It heals 25 HP and offers 3 gifts. At least one is a new glyph while any are left; the rest are new glyphs or wand upgrades (+1 slot, +30 max MP, regen ×1.4, recharge ×0.65; `src/data/shrine.ts`).
  - **Runs now start knowing only `>`**; `)` and `+` are shrine gifts.
  - Gold and buying extras arrive with gold in M7.
- **Run flow and screens** (`src/ui/screens.ts`):
  - **Title:** new run with an optional typed seed, daily run (with its date and seed), tutorial, and Lab.
  - **Esc pauses**, showing the place and seed, with resume, restart and quit to title.
  - **Death screen:** "killed by", plus the copyable **run postcard**:
    ```
    SPELLSTRING  seed 48213  depth 2/4
    killed by: ^ (your own fire)
    best spell: +>^   reactions found: 3
    ```
  - **R starts a new run immediately** (measured under 3 s in Playwright).
  - Every option has a key and is also clickable.
- **Postcard data:**
  - **Best spell** is the spell with the most kills, or the most-cast spell if there are no kills. Kills are credited to the spell that last hit the creature.
  - **Reactions found** is the number of distinct reaction ids triggered this run.
  - **"your own fire / your own steam"** now works: after one of your own fire (or fire + water) bursts lands within 14 cells of you, fire and steam that hurt you in the next 5 s count as yours. This closes the M4 known issue.
- **Seeds** (`src/core/seeds.ts`): run seeds are 1–999999. The daily seed is a hash of the UTC date. Typed seeds can be numbers or any text.
- **Tutorial** (`levels/tutorial.txt`, a hand-editable ASCII map):
  - **Sections:** a step to jump, a pool to "drink", **a fire gate under a low ceiling** (no way over it), a sand pile, **a pit 9 wide and 6 deep** (too wide to jump, far wall too tall to climb, with a ledge so falling in only costs a retry), a chest, a slime, and the exit.
  - **Hints:** one short line per section (`src/data/tutorial.ts`), hidden once its lesson is done (you have water, the vent is out, and so on).
- **URL shortcuts:** `?seed=N`, `?daily`, `?tutorial`, `?lab`, and `?level=test` (the developer test room the browser tests use).
- **Lab** is now a title-screen mode: the test room with every glyph and a full pouch. L only toggles Lab in the Lab and the test room, never in a run.
- **HUD:** a "Sandstone Hollows 1-2 · seed 48213" line, and the tutorial tip at the top. The bottom hint bar hides behind menus.

### How to try it
1. Run `npm run dev` and take the title screen's **T: tutorial**.
2. Then try **Enter** for a random run, a typed seed such as `48213`, or **D** for the daily run.
3. Reach `O`, pick a shrine gift, and continue.
4. Die (the death screen shows the postcard; C copies it), then press **R**.
5. In the Tar Pits, douse a fire vent's mouth with `>~`.

### Tests (183 unit, 7 e2e)
- **Generator:**
  - **500 seeds all connect spawn to exit.** Generation averages about 9 ms per level, the worst is about 30 ms, and the fallback tunnel was needed once.
  - **The same seed gives an identical level** (grid, spawn, exit, creatures, chests and vents), while other seeds and biomes differ.
  - Biome furnishing (Hollows water and sand, Tar Pits oil and vents).
  - The creature budget is spent, grows with depth, and keeps away from the spawn.
  - Chests are reachable.
  - The reachability model is checked on hand-made maps: walk, a 4-cell ledge jumpable but 5 not, and swimming up and out.
- **Run:**
  - Seeded runs are identical.
  - Hollows 1-1 → 1-2 → Tar Pits 2-1 → 2-2 → won, with a shrine between each pair.
  - HP, pouch, wand spell and gifts carry over, and the shrine heals 25.
  - Runs start with only `>`, and the shrines teach `)` and `+`.
  - Wand upgrades take effect (a 5-glyph spell fits after +1 slot).
  - **The exact postcard text.**
  - **Dying in your own fire says "your own fire".**
  - Best-spell rules.
  - Daily and typed seeds.
- **Features:** a chest delivers charges, a vent burns past any fire's lifetime and goes out when water reaches it, and the portal ends the level.
- **Tutorial:**
  - **The file loads** with all its pieces.
  - The pit can't be crossed until it's filled with sand, and then it can.
  - Falling into the pit is never a trap.
  - The gate can't be bypassed.
- **Playwright:**
  - Title → seeded run → shrine (3 cards; Digit1 picks) → level 1-2 → Esc pause and resume → death with the postcard → **R starts a new run in under 3 s** → back to the title → tutorial (with its tip) → daily run.
  - All earlier browser tests now run in the `?level=test` room.

### Feel decisions to review
- **Level size** is 256 × 144 for both biomes. Hollows are tighter (noise scale 18, threshold 0.5); Tar Pits more cavernous (22, 0.48).
- **Budget:** Hollows 14 + 4/level, Tar Pits 18 + 4/level. That's roughly 8–12 creatures on level 1.
- **Chests:** 2 per level, holding 12–20 charges of each of two materials from the biome's loot list.
- **Shrine:** heals 25. Three offers, at least one a glyph while any are left. Wand upgrades are +1 slot (max 9), +30 MP, regen ×1.4, recharge ×0.65.
- **Fire vent gates:** each empty gate cell catches fire with chance 0.12 per tick. That's dense enough to block, and walking through costs about 30 HP.
- **Tutorial hints** name controls only ("hold right click on `~` to drink it in"), and each vanishes once its lesson is done.

### Ambiguities resolved (please check)
- **What "connected" means:** reachable by walking, jumping, falling and swimming, under a model slightly more conservative than the real jump. It is not just "flood-fill through air", because a flood fill would count floors 30 cells overhead.
- **Starting glyphs:** a run starts with `>` only (the spec's "starting wand: spell `>`"), and the shrines teach `)` and `+`. M7's new glyphs join that pool. Lab and the test room know everything.
- **Daily seed:** one per UTC day, so everyone shares it.
- **The tutorial ends** on a "tutorial complete" screen, where R starts a real run.
- **The end of a descent:** with 4 levels, the last exit shows "THE DESCENT GOES ON". M7 adds levels 5–6 and M10 the boss.
- **Fire vents** are entities, not a material (a material would have needed a "burns forever" rule in the sim). A vent counts as doused when water touches its mouth.

### Known issues
- **You can fall off a Tar Pits bridge into a deep cavern** and have to dig out (rock harvests slowly) or build up with sand. The generator guarantees spawn-to-exit, not "back to the route from anywhere". An "every reachable spot can get back" check would cost about one more search per level; worth doing if the playtest finds it annoying.
- **A fire vent can sit on the main route** with no water nearby. You can walk through it (about 30 HP), or carry water.
- **Levels share one basic shape** (left to right, one meandering route). M7's third biome is a good moment to vary the route (vertical drops, branches).
- **Gold**, shrine extras and the Codex arrive in M7 and M8.

### Dependencies
No new dependencies.

---

## M5: Creatures made of glyphs (done)

### What changed
- **Creature data** (`src/data/creatures.ts`): everything the spec asks for lives in one table per creature: speed, HP, size, senses, memory, attack, drops, flammability, kinetic and heavy-impact multipliers, and **how each material affects it** (damage per second, healing, slowing, immunity).

  | Creature | HP | Moves | Attack (windup → effect) | Weak to | Immune / heals | Drops |
  |---|---|---|---|---|---|---|
  | `b` bat | 5 | flies erratically | 0.4 s hover → swoop (7 dmg) | fire, steam, water | — | nothing |
  | `s` water slime | 24 | crawls | 0.5 s squish → lunge (8) | fire | heals in water | `~` 16, less per split |
  | `i` ember imp | 22 | hovers to your side, above you | 0.67 s glow → fire bolt (6 + fire) | **water 70/s, steam 45/s** | fire | `^` 10 |
  | `t` tar toad | 26 | hops | 0.57 s puff → oil spit (3 + 8 oil) | fire (catches fire), steam | heals in oil | `=` 14 |
  | `G` stone golem | 110 | slow walk | 0.6 s wind-up → punch (18, big knockback) | **heavy impacts ×2.5** | fire, steam; kinetic ×0.35 | `#` 10 |
- **The creature system** (`src/game/creature.ts`, `src/game/creatures.ts`):
  - **States:** idle (wander) → chase → windup (the telegraph) → attack → recover.
  - **Senses:** every 6 ticks, staggered per creature, it checks range plus a line of sight **blocked by solids and smoke** (`blocksSight`). Being hit by the witch also gives her away. A creature that loses sight keeps hunting her last known position for a few seconds.
  - **Movement:** walkers step up 1-cell ledges and hop 2-cell ones. Hoppers only move by hopping. Bats jitter. Imps hover at an offset beside and above you, bobbing. Creatures sink slowly in liquids and can be buried by powders like the witch.
  - **Telegraphs:** during the windup the creature blinks red, and a `!` above it fills in as the attack nears. Swoops and lunges lock their direction when the windup ends, so stepping aside works.
  - **Material table applied every tick:** a single touching cell does half damage, and two or more do full. Fire sets flammable creatures alight; water puts them out.
  - **Burning:** it damages the creature and **spreads**: burning creatures, fiery imps and a burning witch set flammable creatures and each other alight on contact, and light the oil or wood they touch. Imps are always fiery but never burn.
  - **Slimes split** when an impact hurts but doesn't kill them: two halves, two generations deep. The halves fly apart with brief i-frames.
  - **Drops on death:** each creature's material bursts out where it died, so you can harvest your enemies. Bats drop nothing.
- **Combat:**
  - **Spell hits:** a kinetic shot deals 6 × the creature's kinetic multiplier. A matter carrier deals 3 plus heavy matter per glyph (sand 4, rock 6) × the creature's heavy multiplier, then bursts its payload on the creature. Spells hit any creature, and creature projectiles hit other creatures too (an imp's bolt sets a toad in its path alight).
  - **Knockback** scales with 1 / mass. **I-frames:** creatures get 8 ticks after an impact; the witch gets 45 ticks after a creature's blow, and blinks.
  - **Floating damage numbers:** white for impacts on creatures, amber for damage over time (batched every 20 ticks), red for blows on the witch.
  - The death card names the killer: "killed by: b (a bat)", or "i (an ember imp's fire bolt)".
- **Refactor:** carriers moved out of the caster into `Carriers` (`src/game/carriers.ts`), so creatures can throw them too, each with an owner. Effects (sparks, fizzles, numbers) now live in `Effects`. Systems share a `GameContext` interface.
- **Levels:** creature letters (`b s i t G`) in ASCII maps spawn creatures (`LoadedLevel.creatures`). The test room now has a slime near the spawn, two bats in the open air, a golem on the middle platform, and an imp with a toad by the burning scaffold, plus a toad on the oil.
- **Lab:** J picks a creature and K spawns it at the cursor. C also clears creatures.
- **Rendering:** creature glyphs with hurt, burning and windup colors, plus a text label layer in the renderer for numbers and `!`.
- **Data fixes:** the toad's spit speed is 22 (a lob at 17 only reaches 6.9 cells, short of its 11-cell attack range). Lob aiming compensates for per-tick integration.

### How to try it
1. Run `npm run dev`.
2. The slime next to the spawn notices you, squishes (blinking red, with a `!`), then lunges. Shoot it with `>`: it splits, and the halves split again.
3. Kill a slime and harvest its puddle with right click.
4. Head right to the scaffold: the imp hovers and throws fire bolts, and the toad spits oil.
   - Harvest water, write `>~3`, and douse the imp.
   - Stand so the imp's bolt passes through the toad, or let the toad's oil land near the imp's fire.
5. Find the golem below the middle platform. Kinetic bolts barely scratch it; `>.3` hits hard.
6. In Lab (L), press J to pick a creature and K to drop it at the cursor, to set up fights.

### Tests (161 unit, 6 e2e)
- **The done-when list:**
  - **Water hurts an imp** (it dies under a stream of water), while the same imp under fire takes nothing.
  - **A toad ignites when fire touches it**, then keeps hopping (at least 3 hops, more than 3 distinct cells) while losing HP.
  - **Smoke blocks line of sight:** checked with `canSee` against smoke, rock, sand, water and steam, and in play (a bat behind a smoke screen stays idle; in the open it hunts).
  - **A slime's death leaves water you can harvest:** 16 cells, at least 10 of them harvested back.
- **Behavior:**
  - Slimes split twice and the smallest doesn't split.
  - **A bat completes a full windup before its first attack and before she is hurt.**
  - Player i-frames, and knockback plus i-frames plus a damage number on a creature.
  - **Golems:** kinetic hits do 0.35×, `>.3` does more than 5× that, and fire does nothing to them.
  - An imp sets a toad alight by touch.
  - **An imp's fire bolt hits a toad and sets it burning.**
  - A burning witch lights a toad, and a fiery imp lights her.
  - Each creature's drop (bats drop nothing), a bat killing her with the right death text, and a toad spitting oil.
- **Data and plumbing:** lob aiming lands within 0.75 cells for four targets, creature data integrity (no glyph clashes, every attack telegraphed at least 18 ticks), level spawning, and determinism for a seed.
- **Performance:** 40 hunting creatures cost 0.09 ms/tick.
- **Playwright:** the test room has creatures, and a bolt at a golem lowers its HP and shows a number.

### Feel decisions to review
- **Windups (telegraphs):** bat 24 ticks, slime 30, toad 34, golem 36, imp 40. Recover is 30 ticks after every attack, and then cooldowns run.
- **Senses:** bat 18 cells, imp 20, toad 14, slime and golem 12. Memory is 4–6 s after losing sight.
- **HP:** bat 5 (one bolt), slime 24 (splits), imp 22, toad 26, golem 110. **Damage to the witch:** swoop 7, lunge 8, fire bolt 6 (+ burning), spit 3 (+ oil), punch 18.
- **Imp vs water:** 70 dps at full contact. A `>~3` burst usually kills it; a single `>~` takes it to about half.
- **Golem vs heavy matter:** `>.3` deals 3 + 3 × 4 × 2.5 = 33.
- **Witch i-frames** are 0.75 s (only against creature blows, not materials).
- **Damage numbers** last 0.83 s and rise 2.2 cells/s.

### Ambiguities resolved (please check)
- **Self-inflicted versus world damage:** creatures take damage from every spell, the witch's and other creatures', but never from contact with each other except through burning.
- **What "telegraph" means:** every attack has a visible windup (red blinking plus `!`) of at least 0.4 s. Lunges and swoops then commit to the direction they locked, so you can sidestep them.
- **Slime splitting:** only on impacts (bolts, punches, spit), not on damage over time. Each half keeps half of the remaining HP, so splitting never adds HP overall.
- **Smoke blocks sight; steam doesn't.** The spec names smoke only.
- **Imps** are permanently fiery: touching one sets you alight, and they light oil and wood they pass.
- **Creatures don't block each other or the witch.** Bodies overlap, and contact only matters for attacks and fire.

### Known issues
- **No pathfinding.** Walkers head straight for you (hopping 2-cell steps), and flyers fly straight and can press against walls until they lose sight of you. M6's caves may need simple steering.
- Creatures don't avoid hazards: slimes walk into fire, and imps hover over water.
- A creature spawned overlapping solid ground pops upward. Level spawns are cell-centered, so this only affects Lab and test spawns.
- "Killed by your own fire" still isn't tracked (see M4).

### Dependencies
No new dependencies.

---

## M4: Spells v1 (done)

### What changed
- **Spell language** (`src/game/spell/`):
  - `parse.ts` holds the tokenizer and a recursive-descent parser for the full spec grammar, including M7's `!`, `?`, `[ ]n`, `@` and `_`, so those already parse.
  - Every non-space character takes a slot. The parser never throws: every problem comes back as a friendly error with the position of the character at fault.
  - Error types: matter before a delivery, unknown glyph, unowned glyph, `!` with nothing after it, `!` in the wrong place, unclosed `[`, stray `]`, missing loop count, empty loop, digit in the wrong place (several variants), dangling `+`, too long for the wand, and empty spell.
- **Interpreter** (`plan.ts`):
  - Turns the parse tree into a cast plan: one delivery and a carrier count per cast, digits expanded into payloads, loops expanded, and trigger plans nested under their cast.
  - Mana is the sum over the expanded spell. Costs are in `TUNING.spellCost` (delivery 5, matter 2, `+` 10, `!` 10, `?` 4, loop 15).
  - Per-click caps (32 carriers, 400 cells, trigger depth 4) are applied *while* expanding, so `[[[[[[>~]9]9]9]9]9]9` costs bounded work. The plan records why it was cut off, and the game warns.
  - `compile.ts` runs parse + plan for the wand, the editor and the HUD.
- **Wand** (`src/game/wand.ts`):
  - Has slots, max mana, mana regen, cast delay and recharge. **Mana now lives on the wand**, as the spec puts it, not on the witch.
  - The starting wand has 4 slots, 100 MP, 20 MP/s, a 5-tick cast delay and an 18-tick recharge, with the spell `>`.
  - The wand only ever holds a spell that compiles.
- **Casting** (`src/game/casting.ts`):
  - A click pays for the whole spell up front, then queues its casts, which fire a cast delay apart and aim at the cursor at the moment each fires. Recharge starts after the last cast. Holding the button repeats as fast as recharge allows.
  - Not enough mana: nothing fires, and a message says how much it needs.
  - `+` fans carriers out 9° apart.
  - **Charges are spent per carrier as each cast fires**, so `+>~` spends 3. A glyph with no charges **fizzles**: a grey glyph pops off the witch, the slot flashes red in the HUD, and a message says "Fizzle: no `~` charges (water)". The rest of the payload still flies. A carrier whose whole payload fizzled is a harmless dud, drawn as a grey glyph.
- **Carriers:**
  - `>` bolt: 46 cells/s in a straight line, range 48.
  - `)` lob: 26 cells/s with gravity 42.
  - They march in steps of 0.25 cells, so they never skip a wall.
  - They burst on rock, wood or powder, on splashing down into a liquid, or at the end of their range. A carrier launched underwater swims out before it can splash.
  - A kinetic shot (no payload) does 6 damage plus knockback, and only to the witch for now (creatures arrive in M5).
  - Carriers ignore the witch for 12 ticks after launch. After that, her own spells can hit her, scaled by `selfDamageScale`.
- **Payload release** (`src/game/release.ts`):
  - 12 cells per matter glyph are flood-filled into the open (empty or gas) space connected to the impact point, nearest first, so a burst never leaks through a wall.
  - The glyphs are shuffled together, and then **one boosted reaction pass runs over the burst** (contact chances ×3), so `>~^` boils into steam on the spot instead of the water draining away first.
  - New `Simulation.reactAt(x, y, scale)`.
- **Ownership:** digits are always owned. `>`, `)` and `+` are known from the start. **A matter glyph is owned once you've harvested at least one charge of it** (`Pouch.seen`).
- **Spell editor** (`src/ui/editor.ts`), opened with **Tab**:
  - It pauses the game.
  - It shows the spell in a text field, selected so typing replaces it at once.
  - **Typing only accepts glyphs you own.** A refused key shows why ("You have never collected `~` (water): harvest some first.").
  - **Paste goes through**, with missing glyphs struck through in red and an error.
  - Live as you type: the slot boxes (errors underlined, empty charges greyed, overflow dashed), the cost, what the spell does ("1 cast, 3 carriers, 36 cells, uses ~3"), errors with column numbers, and warnings (a glyph will fizzle, the spell will be cut off, it costs more than the wand holds).
  - The owned glyphs are listed with their charges, and clicking one inserts it.
  - **Enter or Tab** writes the spell into the wand. **Esc** cancels. An invalid spell isn't written: the wand keeps its old spell, and the draft is kept for the next time you open the editor.
- **HUD:**
  - A `WAND [>][~][^][·] 9 MP` line: glyphs you have no charges for are grey, and a fizzled glyph flashes red. The cost dims while the wand is recharging.
  - A message line above the bars (wand written, fizzles, not enough mana, cut off).
- **Rendering:**
  - Carriers are drawn as their payload glyph (cycling through multi-glyph payloads) with a dim trail. A kinetic shot is drawn as `•`.
  - Fizzles are drawn as grey glyphs, and impacts throw `*` sparks.
- **Input:** left click casts. Clicks are held until a tick uses them, like jump presses, so a click shorter than a frame still fires. Keys typed into the editor never reach the game.
- **Two changes to earlier milestones:**
  - **Gas rise rate:** gases now rise on 35% of ticks and otherwise billow sideways (`TUNING.gasRiseChance`). Steam used to shoot up at 60 cells/s, so a `>~^` cloud was gone before you could read it.
  - **Shallow puddles:** the witch can jump off the bottom of a puddle that is no deeper than she is tall. Before, a 1-deep puddle counted as swimming and she couldn't jump out.

### How to try it
1. Run `npm run dev`.
2. Harvest some water (left basin) and fire (the burning scaffold) with right click.
3. Press **Tab**, type `>~^` and press Enter. Left-click at a wall: a steam burst.
4. Harvest sand and write `>.3`. Shoot it into a pit or a corner, then walk across the pile.
5. Harvest oil and write `)=3`. Lob it, then light the puddle with `>^`.
6. Write `+>^` for three fanned fire bolts.
7. Spend all your fire, then cast `>~^` again to see `^` fizzle while the water still flies.
8. In the editor, try typing a glyph you haven't harvested (refused), and try `3>`, `>~33` or `>~^.=` to see the errors.

### Tests (141 unit, 5 e2e)
- **Parser** (`spell.test.ts`):
  - Every M4 example spell (`>~`, `>^`, `>.3`, `>~^`, `)=3`, `+>^`), plus kinetic `>`, multiple casts, and M7's `>!)~5`, `[>.]4`, a trigger inside a loop, `_` and `@`.
  - **Every error type**, with exact positions and messages.
  - A 3,000-spell fuzz test: nothing throws, hangs or exceeds a cap.
- **Interpreter:** mana for every example spell, digit and `+` expansion, charges needed (`+>~` = 3 water), loops, triggers, all three caps, triggers counting once per carrier, and a no-hang test on 6-deep nested loops.
- **Editor filter:** typing rejects glyphs you don't own and unknown characters.
- **Casting** (`casting.test.ts`):
  - The starting wand.
  - Writing only owned and valid spells.
  - Ownership rules.
  - Mana spent and the bolt's direction.
  - Holding repeats at exactly the recharge rate.
  - Cast delay between casts.
  - Refusal without enough mana.
  - `+>~` fans 3 carriers 9° apart and spends 3 water.
  - Fizzle with the rest still working.
  - A fully fizzled carrier is a dud.
  - A bolt never hits the caster on launch.
  - **Self-damage:** a lob thrown straight up comes down on her for exactly the kinetic damage.
- **Release:** 12 cells per glyph, never through a wall, displaces gas, and water + fire becomes at least 4 steam cells before the first sim tick (checked on 10 seeds).
- **Scenarios:**
  - **`>~^` at a wall produces steam.**
  - **`)=3` leaves a 36-cell oil puddle**, at most 2 rows deep and at least 17 wide.
  - `>.3` fills a pit, and the witch then walks across it.
  - A `>~3` bolt puts out a burning wood pile that is still burning in a control run.
- **Movement:** she jumps out of a puddle as deep as she is tall, but gets no rocket jump off the bottom of a deep pool.
- **Performance:** a click at the caps (32 carriers, 400 cells) costs 0.08 ms/tick on average, 1.1 ms at worst. The busy world is still about 2.0 ms/tick.
- **Playwright:**
  - Tab opens the editor and the game pauses (the tick count stops).
  - Typing `~` without owning it is refused, and the editor explains why.
  - A pasted `>^` shows the missing `^` struck through, plus an error.
  - `>~3` types once water is owned and shows "cost 11 MP". Enter writes it into the wand.
  - A left click casts it and spends 3 water.
  - No console errors.

### Feel decisions to review
- **Starting wand:** 100 MP, 20 MP/s, cast delay 5 ticks (0.08 s), recharge 18 ticks (0.3 s). Holding the button with `>` fires about 3.3 times a second.
- **Bolt** 46 cells/s with range 48. **Lob** 26 cells/s with gravity 42 (peak about 8 cells straight up). Lobs are lighter than the witch (gravity 70), so they read as thrown.
- **Burst:** 12 cells per glyph, filling nearest-first with a little jitter, so bursts come out roughly round. Released matter reacts on the spot at 3× its contact chance (`burstMixChanceScale`).
- **Editor:**
  - Opening it selects the whole spell, so you can type a new one immediately, since speed matters mid-fight. Arrow keys deselect if you want to edit.
  - Tab both opens it and writes the spell, so a quick swap is Tab, type, Tab.
- **Kinetic shot:** 6 damage, 14 cells/s knockback. **Self-damage scale is 1.**
- **Fizzled carriers still fly**, as grey duds, so you see the fizzle at the target as well as at the wand.
- **Gas rise chance 0.35:** steam lingers about 3× longer near where it formed. It still rains back down in the test room.

### Ambiguities resolved (please check)
- **What "owned" means.** I chose: matter glyphs are owned once harvested at least once; `>`, `)` and `+` are known from the start; digits are always owned. M7 glyphs (`@ _ ! ? [ ]`) parse but aren't owned yet. The M6 Glyph Shrine can start the run with fewer and offer the rest.
- **Mana belongs to the wand** (the spec lists max mana under wand stats). The HUD's MP bar shows the active wand's mana.
- **When charges are spent:** when each cast fires, per carrier. Mana for the whole click is paid up front, so a fizzle doesn't refund mana.
- **An invalid spell is never written to the wand.** Closing the editor on an error keeps the old spell and shows why, and the draft comes back next time. A broken spell can't leave you unarmed mid-fight.
- **Carriers hit:** solids, powders, and the surface of a liquid. They pass through fire and gas.
- **Caps cut at the point they're reached:** a cast is trimmed to fit (fewer carriers, then fewer glyphs), and everything after it is dropped. Mana is only charged for what fires.
- **Triggers count toward the caps once per carrier** (every carrier triggers), but their mana is paid once per glyph, matching "sum over the expanded spell".
- **Until M7, `@` and `_` fly like bolts** if a test owns them. They can't be owned in play yet.

### Known issues
- **Self-damage is tracked only for kinetic hits** ("killed by: > (your own bolt)"). Fire or steam you cast yourself is reported as plain "burning" or "scalding steam". Tracking who made a cell is planned with the death screens in M6.
- **Underwater bursts release nothing:** release only fills empty or gas cells, so matter burst inside a pool is lost along with its charges.
- **Fire released in mid-air hangs there** until it burns out, because fire cells don't fall (M2 fire behavior).
- **Esc only closes the editor** for now. The pause menu comes in M6.

### Dependencies
No new dependencies.

---

## M3: The witch (done)

### What changed
- **Physics body** (`src/game/body.ts`): a reusable box with a continuous position; creatures will use it in M5.
  - Rock, wood and powders are solid. Out of bounds counts as solid.
  - Moves are swept per axis in substeps of at most 0.2 cells, and a blocked substep snaps flush to the blocking cell's edge. Very large moves are clamped, never coarsened, so nothing tunnels at any speed.
  - The body steps up ledges up to 1 cell high automatically while walking or swimming.
  - Powder the body is already inside (it was buried) is ignored for collision, so the witch can wriggle out. Powder she hasn't entered yet is still solid.
- **The witch** (`src/game/player.ts`):
  - Walking has separate acceleration on the ground and in the air.
  - Jumping has coyote time (counted in airborne ticks since last on the ground), a jump buffer, and variable height: releasing jump while rising cuts upward speed by 55%.
  - Swimming applies when her center is in any liquid. She sinks slowly; W/Space swims up and S swims down; she moves slower sideways. A fresh jump press with her head above the surface leaps out.
  - HP 100. Mana 100, regenerating 20/s; casting arrives in M4.
- **Statuses:**
  - **Burning:** caused by touching fire cells. It deals 9/s and lasts 3 s after the last contact; standing in fire adds 14/s. **Water in contact puts burning out immediately.** While burning, she can set oil and wood she touches alight, using that material's fire reaction at half its chance (the new `Simulation.exposeToFire`).
  - **Scalded:** steam deals 16/s.
  - **Buried:** any powder overlapping her slows her to 35%. With powder over her head for more than 1 s, she suffocates at 12/s.
- **Death and restart:** death is instant, records what killed her (`killed by: ^ (burning)`) and freezes her. Press **R** or Enter to restart the room immediately with the next seed.
- **Harvesting** (`src/game/harvest.ts`), by holding right click:
  - It locks onto the material under the cursor and pulls cells of that material within 2.5 cells of the cursor. The cursor is pulled back to within 12 cells of the witch.
  - She needs line of sight to each cell (`src/game/los.ts`, reusable for creature senses).
  - Liquids, powders and gases come off the top, so a pool drains like drinking. Solids dig from the side nearest the witch.
  - Rates come from each material's new `harvestRate` (cells/s): fire 45, water 40, sand/oil/steam/smoke 30, wood 5, rock 2.5.
  - Each cell flies to the witch as a glyph particle that homes in, and becomes a charge when it arrives.
  - **Pouch:** each material is capped at 50 charges, and charges still in flight count toward the cap. When a material is full, the HUD says FULL and the ring turns red.
- **Input:**
  - `TickInput` (`src/game/input.ts`) now carries moving, jump pressed and held, aim in world cells, and harvest.
  - A jump press is held until a simulation tick uses it, so presses in frames that run no ticks aren't lost.
  - `InputManager.mouseWorld()` gives the mouse in fractional world cells.
- **HUD** (`src/ui/hud.ts`): text HP and MP bars, status tags (BURNING, SCALDED, BURIED · SUFFOCATING, SWIMMING), and the pouch, with each glyph in its material color. There's also a death card.
- **Rendering:**
  - The witch's `@` turns orange (flickering) while burning, pink when scalded, red the tick she's hurt, and grey when dead.
  - Harvest particles are drawn as glyphs, and the harvest area as a dashed ring.
  - The camera leads slightly in her direction of travel.
- **Debug hook:** `window.spellstring` exposes `game`, `view` and `dpr` read-only. Playwright uses it now, and the M10 bot test will too.

### How to try it
- Run `npm run dev`.
- Walk with A/D and jump with W, Space or ↑. Tap for a short hop and hold for a full jump.
- Drop into the left basin and swim: W up, S down, and a fresh jump at the surface leaps out.
- Hold right click on the water to drain it, and watch the `~` glyphs fly to you.
- Dig into rock (slowly) or wood with right click.
- Walk into the burning scaffold to catch fire, then jump into water to put yourself out.
- Burn to death, then press R.

### Tests (83 unit, 4 e2e)
- **No tunneling:** moves of up to 10^9 cells stop flush against a 1-cell wall from either side. A 10,000-cell fall lands on a 1-cell floor. A diagonal dash never ends inside rock. A witch pushed at 10× the speed cap for 2 s never passes a wall.
- **Movement:** standing on the floor, walking speed, full jump height matching v²/2g (±0.5), a tap jump under half that, coyote time (the last allowed tick works, the next doesn't), the jump buffer, stepping up a 1-cell ledge but not a 2-cell wall, and the full swim cycle.
- **Statuses:**
  - Fire sets her burning and **walking into water puts it out**. Burning damage is exact.
  - A burning witch ignites oil, and steam scalds.
  - Sand buries and then suffocates her, and she can dig out by harvesting the sand.
  - Death records its cause, and mana regenerates.
- **Harvesting:**
  - **20 water cells become exactly 20 charges** with nothing left in flight, and **an 80-cell pool stops at the 50 cap, leaving 30 in the world.**
  - Pools drain from the top, and rock digs slowly from the near face (2–3 cells in 2 s).
  - Nothing is harvested through a wall or beyond reach, and harvesting is deterministic.
- **Playwright:** the witch walks, jumps, digs (gaining charges), dies, shows the death card and restarts in under 3 s, with no console errors.

### Feel decisions to review
- **Hitbox** is 0.75 × 0.9 cells, so she fits 1-cell tunnels. She **steps up 1-cell ledges automatically**, because without it bumpy cave floors snag every few steps.
- **Movement numbers:**
  - Walking: 10 cells/s, with ground acceleration 110 and air acceleration 60.
  - Gravity: 70, with terminal fall speed 32.
  - Jumping: launch speed 25.5 (about 4.6 cells high), jump cut 0.45, 6 ticks of coyote time and a 7-tick jump buffer.
  - There's no fall damage.
- **Swimming:** idle sinking is slow (2.5 cells/s), swimming is 6.5 cells/s, sideways speed is 60%, and a fresh jump at the surface leaps out at 80% power. W does double duty as jump and swim-up, per the spec.
- **Harvesting:**
  - The radius is 2.5 cells around the cursor and the reach is 12 cells. She needs line of sight, so she can't drain a pool through a wall.
  - The material locks while the button is held, so a cell draining away doesn't drop the lock.
  - Charges count only when they arrive, after about 0.2–0.5 s of flight.
- **Damage:**
  - Burning: 9/s for 3 s after contact, plus 14/s while standing in fire.
  - Steam: 16/s.
  - Buried: she slows to 35%, and suffocates at 12/s after 1 s with sand over her head.
  - All of these sit in `tuning.ts`.
- **Restart** happens on R or Enter, not automatically, so you can read what killed you.
- **Camera lead** is 0.18 s of velocity horizontally (half that vertically).

### Ambiguities resolved
- **"Settled powders" block the player:** all powders are solid to her, except powder already inside her hitbox.
- **Swimming covers any liquid**, oil included. Only water puts out burning; oil doesn't, and a burning witch in oil will light it.
- **Charges arrive by flight.** They're added when the glyph reaches her, and in-flight glyphs count toward the cap so you can never exceed it.
- **Gold → wallet** is deferred to M7, since gold arrives then.
- **R restarts** the room with the next seed. The real run flow (title → run → death screen) comes in M6.

### Known issues
- The HUD panel covers a strip in the bottom-left of the view. It may move in the M9 UI pass.
- The HUD pouch shows arrived charges only; there's no in-flight counter.
- Harvest particles use the material's brightest shade, which can blend in when flying over the same material.
- ~~Left click does nothing outside Lab until spells arrive in M4.~~ Fixed in M4.

### Dependencies
No new dependencies.

---

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
