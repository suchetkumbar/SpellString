# Spellstring: progress log

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
