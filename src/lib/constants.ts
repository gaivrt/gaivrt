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
  /** Delay before cracks appear */
  CRACK_DELAY: 30_000,
  /** Crack growth animation duration */
  CRACK_GROW: 2_000,
  /** Crack shatter animation duration */
  CRACK_SHATTER: 800,
  /** Observer text idle threshold */
  OBSERVER_IDLE: 18_000,
  /** Core reveal delay */
  CORE_REVEAL: 5_000,
  /** Particle entrance duration (first visit) */
  ENTRANCE_FULL: 4_000,
  /** Particle entrance duration (return visit) */
  ENTRANCE_SHORT: 1_500,
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
