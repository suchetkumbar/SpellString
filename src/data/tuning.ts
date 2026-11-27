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

  // --- Player (M1: free movement, no physics) ---
  /** Free-move speed in cells per second. */
  playerFreeMoveSpeed: 18,

  // --- Debug overlay ---
  /** How often the F3 overlay text refreshes, in ms. */
  debugRefreshMs: 250,
} as const;
