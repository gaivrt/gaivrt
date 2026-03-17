import type { Palette, HSL, BlendedPalette } from './types';

export const PALETTES: Palette[] = [
  {
    name: 'Monet · Water Lilies',
    bg: [240, 237, 228],
    hues: [
      { h: 160, s: 18, l: 62 }, { h: 175, s: 15, l: 68 },
      { h: 210, s: 20, l: 65 }, { h: 195, s: 16, l: 72 },
      { h: 50, s: 22, l: 72 }, { h: 140, s: 14, l: 58 },
      { h: 280, s: 10, l: 70 }, { h: 30, s: 18, l: 75 },
    ],
  },
  {
    name: 'Vermeer · Pearl Earring',
    bg: [242, 237, 226],
    hues: [
      { h: 215, s: 28, l: 52 }, { h: 220, s: 18, l: 62 },
      { h: 42, s: 30, l: 65 }, { h: 35, s: 22, l: 72 },
      { h: 25, s: 16, l: 60 }, { h: 200, s: 12, l: 70 },
      { h: 15, s: 18, l: 68 }, { h: 180, s: 10, l: 65 },
    ],
  },
  {
    name: 'Hokusai · The Great Wave',
    bg: [244, 240, 229],
    hues: [
      { h: 215, s: 30, l: 55 }, { h: 220, s: 22, l: 62 },
      { h: 210, s: 18, l: 68 }, { h: 228, s: 20, l: 58 },
      { h: 42, s: 25, l: 74 }, { h: 38, s: 18, l: 70 },
      { h: 200, s: 16, l: 64 }, { h: 195, s: 14, l: 72 },
    ],
  },
  {
    name: 'Klimt · The Kiss',
    bg: [242, 237, 224],
    hues: [
      { h: 42, s: 35, l: 58 }, { h: 35, s: 28, l: 55 },
      { h: 48, s: 22, l: 68 }, { h: 28, s: 30, l: 52 },
      { h: 80, s: 15, l: 58 }, { h: 55, s: 18, l: 62 },
      { h: 18, s: 20, l: 58 }, { h: 120, s: 10, l: 62 },
    ],
  },
  {
    name: 'Yoshida · Misty Landscapes',
    bg: [240, 237, 230],
    hues: [
      { h: 150, s: 14, l: 65 }, { h: 160, s: 10, l: 72 },
      { h: 200, s: 15, l: 62 }, { h: 210, s: 12, l: 68 },
      { h: 40, s: 14, l: 74 }, { h: 30, s: 10, l: 70 },
      { h: 170, s: 12, l: 58 }, { h: 100, s: 8, l: 68 },
    ],
  },
];

function lerpHSL(a: HSL, b: HSL, t: number): HSL {
  return {
    h: a.h + (b.h - a.h) * t,
    s: a.s + (b.s - a.s) * t,
    l: a.l + (b.l - a.l) * t,
  };
}

function lerpNum(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Get a smoothly blended palette at normalized time t ∈ [0, 1). */
export function getBlendedPalette(t: number): BlendedPalette {
  const total = PALETTES.length;
  const phase = (t % 1) * total;
  const i = Math.floor(phase) % total;
  const j = (i + 1) % total;
  const f = phase - Math.floor(phase);
  const sm = f * f * (3 - 2 * f); // smoothstep

  const A = PALETTES[i];
  const B = PALETTES[j];
  const hues: HSL[] = [];
  for (let k = 0; k < A.hues.length; k++) {
    hues.push(lerpHSL(A.hues[k], B.hues[k], sm));
  }
  const bg: [number, number, number] = [
    lerpNum(A.bg[0], B.bg[0], sm),
    lerpNum(A.bg[1], B.bg[1], sm),
    lerpNum(A.bg[2], B.bg[2], sm),
  ];

  return { hues, bg, nameA: A.name, nameB: B.name };
}
