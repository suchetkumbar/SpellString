/** Tunable numbers. Each says what it affects. */
export const TUNING = {
  // --- Simulation ---
  /** Simulation ticks per second (fixed timestep). */
  simHz: 60,
  /** Max ticks simulated per rendered frame; extra backlog is dropped so a slow frame can't spiral. */
  maxCatchUpSteps: 5,

  // --- Material simulation ---
  /** log2 of the chunk size. Only chunks that changed recently are updated. 4 = 16x16 cells. */
  chunkShift: 4,
  /** Ticks a chunk stays awake after its last change. Higher = fewer stuck settles, more CPU. */
  chunkSleepTicks: 30,
  /** Chance per tick that a powder swaps down into a lighter liquid (lower = sand sinks slower). */
  powderSinkChance: 0.5,
  /** Chance per tick that a gas bubbles up through a liquid above it. */
  gasBubbleChance: 0.2,
  /** Chance per tick that a lighter gas swaps up through a heavier gas. */
  gasSwapChance: 0.5,
  /**
   * Chance per tick that a gas cell tries to rise (else it lingers and billows sideways).
   * 1 = 60 cells/s, far too fast to read a steam cloud; 0.35 is about 20 cells/s.
   */
  gasRiseChance: 0.35,
  /** Chance per tick that a rising gas drifts diagonally instead of straight up. */
  gasDriftChance: 0.35,
  /**
   * Every N ticks, a blocked liquid surface cell looks for a lower spot in its
   * connected body and moves there (communicating vessels / U-tube leveling).
   * Lower = faster leveling, more CPU. Must be well under chunkSleepTicks.
   */
  liquidLevelEvery: 10,
  /** Max cells searched per leveling attempt. Bounds cost; very wide lakes level more slowly. */
  liquidLevelSearchCap: 160,

  // --- Lab mode ---
  /** Default brush radius in cells. */
  labBrushDefault: 2,
  /** Largest brush radius in cells. */
  labBrushMax: 16,

  // --- Rendering ---
  /** Cell size in CSS pixels at zoom 1. Cells are square. */
  cellPx: 14,
  /** Discrete zoom levels for + / -. Index `defaultZoomIndex` is the starting zoom. */
  zoomLevels: [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3] as const,
  defaultZoomIndex: 2,
  /** Glyph font size as a fraction of the cell size. */
  glyphScale: 0.9,
  /** Font weight for world glyphs (700 reads better at small sizes). */
  glyphWeight: 700,
  /** Number of brightness shades per material, picked per cell from its variant byte. */
  materialShades: 4,
  /** Brightness spread across shades: 0.12 means shades range from 0.88x to 1.12x. */
  materialShadeSpread: 0.12,
  /** Fire color by remaining life in ticks: above [0] = hot yellow, above [1] = orange, else dying red. */
  fireBandLife: [30, 12] as const,
  /** Chance per drawn fire cell per frame to show one band cooler (flicker). */
  fireFlickerChance: 0.18,
  /** Water shimmer: ms per shimmer step (lower = faster ripple). */
  shimmerPeriodMs: 140,
  /** Water shimmer: one highlighted cell per this many along each diagonal. */
  shimmerSpacing: 11,

  // --- Camera ---
  /** Camera follow stiffness (1/s). Higher = snappier, lower = floatier. */
  cameraFollowRate: 8,

  // --- Player: body ---
  /** Hitbox half-width in cells (0.375 = 0.75 wide, so the witch fits 1-cell tunnels). */
  playerHalfWidth: 0.375,
  /** Hitbox half-height in cells. */
  playerHalfHeight: 0.45,
  /** Largest ledge (in cells) the witch steps up automatically while walking. */
  playerStepUp: 1.05,
  /** Absolute speed cap in cells/s, a safety bound for anything that pushes the player. */
  playerMaxSpeed: 60,

  // --- Player: walking and jumping ---
  /** Top walking speed, cells/s. */
  walkSpeed: 10,
  /** Acceleration toward walking speed on the ground, cells/s^2. Higher = snappier starts/stops. */
  groundAccel: 110,
  /** Acceleration in the air, cells/s^2. Lower = less air control. */
  airAccel: 60,
  /** Gravity, cells/s^2. */
  gravity: 70,
  /** Terminal fall speed, cells/s. */
  maxFallSpeed: 32,
  /** Jump launch speed, cells/s. v^2 / (2g) = full jump height (~4.6 cells). */
  jumpSpeed: 25.5,
  /** Releasing jump while rising multiplies upward speed by this (variable jump height). */
  jumpCut: 0.45,
  /** Airborne ticks after walking off a ledge during which a jump still works (coyote time). */
  coyoteTicks: 6,
  /** Ticks a jump press is remembered before landing (jump buffer). */
  jumpBufferTicks: 7,

  // --- Player: swimming (any liquid) ---
  /** Gravity multiplier while submerged (floaty). */
  swimGravityScale: 0.2,
  /** Max sink speed when not swimming, cells/s. */
  swimSinkSpeed: 2.5,
  /** Swim speed up/down (W/S), cells/s. */
  swimSpeed: 6.5,
  /** Swim acceleration, cells/s^2. */
  swimAccel: 45,
  /** Horizontal speed multiplier in liquid. */
  swimHorizontal: 0.6,
  /** Jumping out of a liquid at the surface launches at this fraction of jumpSpeed. */
  swimLeap: 0.8,

  // --- Player: health, mana, statuses ---
  playerMaxHp: 100,
  /** Burning: how long it lasts after the last fire contact, in ticks. */
  burnTicks: 180,
  /** Burning damage per second. */
  burnDps: 9,
  /** Extra damage per second while standing inside fire cells. */
  fireContactDps: 14,
  /** While burning, chance multiplier for igniting touched flammables (x the fire reaction chance). */
  burningIgniteScale: 0.5,
  /** Damage per second while inside steam. */
  scaldDps: 16,
  /** Ticks the "scalded" status lingers after leaving steam (HUD feedback). */
  scaldLinger: 20,
  /** Movement multiplier while buried in powder. */
  buriedSlow: 0.35,
  /** Ticks with powder over the head before suffocation damage starts. */
  suffocateGraceTicks: 60,
  /** Suffocation damage per second. */
  suffocateDps: 12,

  // --- Spells: the starting wand (M4) ---
  /** Glyph slots in the starting wand. */
  wandSlots: 4,
  /** Starting wand mana pool. */
  wandMaxMana: 100,
  /** Starting wand mana regained per second. */
  wandManaRegen: 20,
  /** Ticks between the casts of one spell (">~>^" fires its two bolts this far apart). */
  wandCastDelayTicks: 5,
  /** Ticks after a spell's last cast before the wand can fire again (holding the button repeats). */
  wandRechargeTicks: 18,
  /** The starting wand's spell. */
  wandStartSpell: '>',

  // --- Spells: costs and caps ---
  /** Mana per glyph in the expanded spell (digits save slots, not mana). */
  spellCost: { delivery: 5, matter: 2, split: 10, trigger: 10, chaos: 4, loop: 15 },
  /** Cells released per matter glyph when a carrier bursts. */
  burstCellsPerGlyph: 12,
  /**
   * Matter released together reacts at once: one reaction pass over the burst
   * with contact chances multiplied by this (fire+water 0.3 -> 0.9), so >~^ boils on the spot.
   */
  burstMixChanceScale: 3,
  /** Per-click caps, triggers included. Anything past them is cut off with a warning. */
  maxCarriersPerClick: 32,
  maxCellsPerClick: 400,
  maxTriggerDepth: 4,
  /** Angle between fanned carriers from "+", in degrees. */
  splitSpreadDeg: 9,

  // --- Spells: carriers ---
  /** Bolt ">": speed in cells/s and range in cells (it bursts at the end of its range). */
  boltSpeed: 46,
  boltRange: 48,
  /** Lob ")": launch speed (cells/s), gravity (cells/s^2) and lifetime (ticks). */
  lobSpeed: 26,
  lobGravity: 42,
  lobMaxTicks: 240,
  /** Carriers can't hit the caster for this many ticks after leaving the wand. */
  castGraceTicks: 12,
  /** Kinetic shot (a delivery with no payload): damage and knockback speed (cells/s). */
  kineticDamage: 6,
  kineticKnockback: 14,
  /** Multiplier on damage the witch takes from her own spells. */
  selfDamageScale: 1,

  // --- Creatures (per-creature numbers live in src/data/creatures.ts) ---
  /** Creatures look for the player every this many ticks (staggered per creature). */
  creatureSenseEvery: 6,
  /** Ticks a creature ignores further impacts after being hit (i-frames). */
  creatureHitIFrames: 8,
  /** Ticks the witch ignores further creature attacks after one lands (i-frames). */
  playerHitIFrames: 45,
  /** Base impact damage of a matter carrier hitting a creature (kinetic shots use kineticDamage). */
  carrierImpactDamage: 3,
  /** Material contact: this many touching cells counts as full contact (fewer scale down). */
  materialFullContactCells: 2,
  /** Gravity multiplier for walkers and hoppers in liquid. */
  creatureSwimGravityScale: 0.25,
  /** Damage over time is shown as one floating number every this many ticks. */
  damageNumberEvery: 20,
  /** Floating damage numbers: lifetime in ticks and rise speed in cells/s. */
  damageNumberTicks: 50,
  damageNumberRise: 2.2,
  /** Ticks a hit creature (or the witch) flashes white. */
  hurtFlashTicks: 6,

  // --- Harvesting ---
  /** Max charges of each material in the glyph pouch. */
  pouchCap: 50,
  /** Max distance from the witch to a harvested cell, in cells. */
  harvestRange: 12,
  /** Radius around the cursor that harvesting pulls from, in cells. */
  harvestRadius: 2.5,
  /** Flying glyph homing acceleration toward the witch, cells/s^2. */
  harvestParticleAccel: 160,
  /** Flying glyph velocity damping per tick (0..1, higher = less overshoot). */
  harvestParticleDrag: 0.12,
  /** Flying glyphs arrive automatically after this many ticks. */
  harvestParticleMaxTicks: 90,

  // --- Camera ---
  /** Camera leads ahead of the witch by her velocity times this many seconds. */
  cameraLeadSeconds: 0.18,

  // --- Debug overlay ---
  /** How often the F3 overlay text refreshes, in ms. */
  debugRefreshMs: 250,
} as const;
