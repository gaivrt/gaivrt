/** Configuration for the ink bleed noise-threshold system */
export interface InkBleedConfig {
  /** Delay before reveal starts (ms) */
  appearDelay: number;
  /** Full reveal duration (ms) */
  revealDuration: number;
  /** Threshold update interval (ms) */
  revealInterval: number;
  /** Flood transition duration (ms) */
  floodDuration: number;
  /** feTurbulence baseFrequency */
  noiseFrequency: number;
  /** feTurbulence octaves */
  noiseOctaves: number;
  /** Stain color */
  stainColor: string;
  /** Overall group opacity */
  groupOpacity: number;
}
