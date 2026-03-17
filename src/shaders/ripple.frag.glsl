precision highp float;

uniform sampler2D uHeightMap;

varying vec2 vUv;

void main() {
  vec2 data = texture2D(uHeightMap, vUv).rg;

//float waveAlpha = clamp(data.r * 5.0, 0.5, 0.65);
  // Sharp edge: narrow smoothstep transition, no base mask
  float waveAlpha = smoothstep(0.08, 0.10, data.r) * 0.55;

  // Erosion: subtle stain underneath, like ink soaked into paper
  float erosionAlpha = data.g * 0.0;

  float alpha = clamp(waveAlpha + erosionAlpha, 0.0, 1.0);
  gl_FragColor = vec4(0.04, 0.03, 0.02, alpha);
}
