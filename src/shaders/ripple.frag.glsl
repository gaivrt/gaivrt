precision highp float;

uniform sampler2D uHeightMap;

varying vec2 vUv;

void main() {
  vec2 data = texture2D(uHeightMap, vUv).rg;

//float waveAlpha = clamp(data.r * 5.0, 0.5, 0.65);
  // Sharp edge: narrow smoothstep transition, no base mask
  float waveAlpha = smoothstep(0.06, 0.12, data.r) * 0.35;

  float alpha = clamp(waveAlpha, 0.0, 1.0);
  gl_FragColor = vec4(1.0, 0.95, 0.85, alpha);
}
