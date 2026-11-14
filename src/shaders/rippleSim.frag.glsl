precision highp float;

uniform sampler2D uCurrent;
uniform vec2 uMouse;
uniform vec2 uPrevMouse;
uniform float uMouseActive;
uniform vec2 uTexelSize;
uniform float uAspect;
/** Brush radius as a fraction of viewport height */
uniform float uRadius;

varying vec2 vUv;

/** Squared distance from p to segment ab */
float segDist2(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
  vec2 d = pa - ba * h;
  return dot(d, d);
}

void main() {
  vec2 dx = vec2(uTexelSize.x, 0.0);
  vec2 dy = vec2(0.0, uTexelSize.y);
  float n =
    texture2D(uCurrent, vUv + dx).r +
    texture2D(uCurrent, vUv - dx).r +
    texture2D(uCurrent, vUv + dy).r +
    texture2D(uCurrent, vUv - dy).r;

  // Ink left by earlier frames: bleeds a little, fades in about a second
  float ink = mix(texture2D(uCurrent, vUv).r, n * 0.25, 0.1) * 0.955;

  // Brush: a soft capsule from the last rendered mouse position to the current
  // one, so fast movement draws a continuous stroke instead of separate dots.
  // Distances are aspect-corrected so the brush stays round. max() rather than
  // add keeps joints and slow movement from piling up.
  if (uMouseActive > 0.5) {
    vec2 s = vec2(uAspect, 1.0);
    float d2 = segDist2(vUv * s, uPrevMouse * s, uMouse * s);
    ink = max(ink, exp(-d2 / (uRadius * uRadius)));
  }

  gl_FragColor = vec4(ink, 0.0, 0.0, 1.0);
}
