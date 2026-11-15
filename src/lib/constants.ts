/** Timing constants (ms) */
export const TIMING = {
  /** Particle entrance duration (first visit) */
  ENTRANCE_FULL: 4_000,
  /** Particle entrance duration (return visit) */
  ENTRANCE_SHORT: 1_500,
} as const;

/** Particle entrance configuration */
export const ENTRANCE = {
  /** Skip entrance entirely after this many visits */
  SKIP_THRESHOLD: 3,
  /** Chance to show entrance again for returning visitors (0-1) */
  REAPPEAR_CHANCE: 0.25,
  /** Display text */
  TEXT: 'GAIVRT',
  /** Font */
  FONT_FAMILY: 'Georgia, serif',
  FONT_WEIGHT: 700,
  /** Font size = min(width * ratio, max) */
  FONT_SIZE_RATIO: 0.18,
  MAX_FONT_SIZE: 280,
  /** Physics */
  SPRING_FORCE: 0.028,
  DAMPING: 0.87,
  MOUSE_RADIUS: 80,
  REPULSION: 1500,
  /** Min distance (px) for repulsion — prevents force spike at very close range */
  REPULSION_FLOOR: 20,
  /** Noise */
  NOISE_SCALE: 0.012,
  NOISE_DRIFT: 0.0004,
  /** Palette cycle length (frames) */
  CYCLE_FRAMES: 54_000,
  /** Particle skip probability (controls density) */
  SKIP_PROBABILITY: 0.78,
} as const;

/** WebGL performance thresholds */
export const PERF = {
  /** FPS below this → reduce resolution */
  FPS_LOW: 30,
  /** FPS below this → disable WebGL */
  FPS_CRITICAL: 15,
  /** Resolution scale when FPS is low */
  LOW_RES_SCALE: 0.5,
} as const;

/** Wine seeping up through the surface homepage */
export const WINE = {
  /** Never before this many visits */
  MIN_VISITS: 2,
  /** Chance per homepage load (0-1), at most once a day */
  CHANCE: 0.2,
  /** It comes once the visitor has been still this long (ms, random within the range) */
  STILL_MIN: 4_000,
  STILL_MAX: 8_000,
  /** How long the first source stays open (simulated seconds) */
  FIRST_POUR: 1.1,
} as const;
