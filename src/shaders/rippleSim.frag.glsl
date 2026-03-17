precision highp float;

uniform sampler2D uCurrent;
uniform sampler2D uPrevious;
uniform vec2 uMouse;
uniform float uMouseActive;
uniform vec2 uTexelSize;

varying vec2 vUv;

void main() {
  vec2 cur = texture2D(uCurrent, vUv).rg;
  float prevWave = texture2D(uPrevious, vUv).r;

  // --- R: Wave (Hugo Elias) ---
  float nw =
    texture2D(uCurrent, vUv + vec2(uTexelSize.x, 0.0)).r +
    texture2D(uCurrent, vUv - vec2(uTexelSize.x, 0.0)).r +
    texture2D(uCurrent, vUv + vec2(0.0, uTexelSize.y)).r +
    texture2D(uCurrent, vUv - vec2(0.0, uTexelSize.y)).r;
  float wave = nw * 0.5 - prevWave;
  wave *= 0.94;

  // --- G: Erosion (heat equation diffusion) ---
  float ne =
    texture2D(uCurrent, vUv + vec2(uTexelSize.x, 0.0)).g +
    texture2D(uCurrent, vUv - vec2(uTexelSize.x, 0.0)).g +
    texture2D(uCurrent, vUv + vec2(0.0, uTexelSize.y)).g +
    texture2D(uCurrent, vUv - vec2(0.0, uTexelSize.y)).g;
  float erosion = cur.g + 0.05 * (ne * 0.25 - cur.g);
  erosion *= 0.9997;

  // Absorbing boundary — kill within 5% of edges
  float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  float edgeMask = smoothstep(0.0, 0.05, edge);
  wave *= edgeMask;
  erosion *= edgeMask;

  // Mouse injection — both channels
  if (uMouseActive > 0.5) {
    vec2 diff = vUv - uMouse;
    float dist2 = dot(diff, diff);
    float g = exp(-dist2 * 1500.0);
    wave += 0.015 * g;
    erosion += 0.004 * g;
  }

  erosion = clamp(erosion, 0.0, 0.8);

  gl_FragColor = vec4(wave, erosion, 0.0, 1.0);
}
