export interface Particle {
  /** Home position (sampled from text) */
  hx: number;
  hy: number;
  /** Current position */
  x: number;
  y: number;
  /** Velocity */
  vx: number;
  vy: number;
  /** Rendered size */
  size: number;
  /** Color jitter offsets (hue, saturation, lightness) */
  jh: number;
  js: number;
  jl: number;
  /** Base alpha */
  alpha: number;
  /** Breathing oscillation phase */
  phase: number;
  /** Breathing speed */
  breathSpeed: number;
}

export interface HSL {
  h: number;
  s: number;
  l: number;
}

export interface Palette {
  name: string;
  bg: [number, number, number];
  hues: HSL[];
}

export interface BlendedPalette {
  hues: HSL[];
  bg: [number, number, number];
  nameA: string;
  nameB: string;
}

export interface ParticleTextConfig {
  text: string;
  fontFamily: string;
  fontWeight: number;
  maxFontSize: number;
  fontSizeRatio: number;
  skipProbability: number;
  mouseRadius: number;
  springForce: number;
  damping: number;
  repulsion: number;
  noiseScale: number;
  noiseDrift: number;
  cycleFrames: number;
}
