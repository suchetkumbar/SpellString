/** Tunable numbers. Each says what it affects. */
export const TUNING = {
  // --- Simulation ---
  /** Simulation ticks per second (fixed timestep). */
  simHz: 60,
  /** Max ticks simulated per rendered frame; extra backlog is dropped so a slow frame can't spiral. */
  maxCatchUpSteps: 5,

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
