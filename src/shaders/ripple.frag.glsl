precision highp float;

uniform sampler2D uHeightMap;
uniform vec3 uTint;

varying vec2 vUv;

void main() {
  float ink = texture2D(uHeightMap, vUv).r;
  // Thresholding the fading ink narrows the stroke as it ages: a tapered tail
  float a = smoothstep(0.06, 0.75, ink);
  gl_FragColor = vec4(uTint, a * 0.42);
}
