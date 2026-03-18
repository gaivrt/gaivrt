/** Visit tracking thresholds */
export const UNLOCK = {
  /** Visits needed for extra fragments */
  FRAGMENTS_EXTRA: 3,
  /** Visits needed for all thoughts */
  THOUGHTS_ALL: 5,
  /** Visits needed for core flicker */
  CORE_FLICKER: 8,
  /** Visits needed for core access */
  CORE_FULL: 10,
} as const;

/** Timing constants (ms) */
export const TIMING = {
  /** Delay before ink stains appear */
  INK_BLEED_DELAY: 30_000,
  /** Observer text idle threshold */
  OBSERVER_IDLE: 18_000,
  /** Core reveal delay */
  CORE_REVEAL: 5_000,
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
  /** Noise */
  NOISE_SCALE: 0.012,
  NOISE_DRIFT: 0.0004,
  /** Palette cycle length (frames) */
  CYCLE_FRAMES: 54_000,
  /** Particle skip probability (controls density) */
  SKIP_PROBABILITY: 0.78,
} as const;

/** Ink bleed transition configuration */
export const INK_BLEED = {
  /** feTurbulence baseFrequency (lower = larger blotches) */
  NOISE_FREQUENCY: 0.006,
  /** feTurbulence octaves */
  NOISE_OCTAVES: 5,
  /** Full reveal duration (ms) */
  REVEAL_DURATION: 30_000,
  /** Threshold update interval (ms) */
  REVEAL_INTERVAL: 250,
  /** Flood (click) expansion duration (ms) */
  FLOOD_DURATION: 700,
  /** Stain color */
  STAIN_COLOR: '#1a1410',
  /** Overall opacity for multiply blend */
  GROUP_OPACITY: 0.5,
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
