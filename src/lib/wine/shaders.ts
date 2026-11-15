/**
 * GLSL for the wine effect: a stable-fluids solver (velocity in sim cells per second)
 * and the pass that turns the dye into wine on paper.
 */

export const VERTEX = `#version 300 es
in vec2 a; out vec2 v;
void main() { v = a * 0.5 + 0.5; gl_Position = vec4(a, 0.0, 1.0); }`;

export const FRAGMENT_HEADER = '#version 300 es\nprecision highp float;\nin vec2 v; out vec4 o;\n';

const NB = `
  vec4 L = texture(uT, v - vec2(t.x, 0.0)), R = texture(uT, v + vec2(t.x, 0.0));
  vec4 B = texture(uT, v - vec2(0.0, t.y)), T = texture(uT, v + vec2(0.0, t.y));`;

// The water reaches past the page on every side (zoom = how much wider than the page it
// is), so its walls are out of sight. Wine that leaves the page is gone.
export const advect = `uniform sampler2D uV, uS; uniform vec2 t; uniform float dt, keep, zoom;
float inside(vec2 p) { vec2 s = step(0.0, p) * step(p, vec2(1.0)); return s.x * s.y; }
void main() {
  vec2 from = v - dt * texture(uV, (v - 0.5) / zoom + 0.5).xy * t * zoom;
  o = keep * texture(uS, from) * inside(from); }`;

export const splat = `uniform sampler2D uT; uniform vec2 point; uniform vec3 amount; uniform float radius, aspect;
void main() { vec2 p = v - point; p.x *= aspect; o = texture(uT, v) + vec4(amount * exp(-dot(p, p) / radius), 0.0); }`;

// What wells up has a strength of its own: it replaces paler wine instead of piling up on it
export const soak = `uniform sampler2D uT; uniform vec2 point; uniform vec3 amount; uniform float radius, aspect;
void main() { vec2 p = v - point; p.x *= aspect; o = max(texture(uT, v), vec4(amount * exp(-dot(p, p) / radius), 0.0)); }`;

// The outward push of a source, added on top of the water's own motion: the same on every
// side but for a few slow lobes, so that a pool is round without being a circle.
export const spring = `uniform sampler2D uT; uniform vec2 point, t; uniform vec3 phase; uniform float strength;
void main() {
  vec2 p = (v - point) / t;
  float r = length(p) + 1e-3, a = atan(p.y, p.x);
  float lobes = 1.0 + 0.18 * sin(2.0 * a + phase.x) + 0.2 * sin(3.0 * a + phase.y) + 0.12 * sin(5.0 * a + phase.z);
  o = texture(uT, v) + vec4(p / r * strength * lobes * (1.0 - exp(-r * r / 16.0)) / r, 0.0, 0.0); }`;

export const curl = `uniform sampler2D uT; uniform vec2 t;
void main() {${NB} o = vec4(0.5 * (R.y - L.y - T.x + B.x), 0.0, 0.0, 1.0); }`;

// Vorticity confinement keeps the curls alive
export const forces = `uniform sampler2D uT, uV; uniform vec2 t; uniform float dt, swirl;
void main() {${NB}
  vec2 f = 0.5 * vec2(abs(T.x) - abs(B.x), abs(R.x) - abs(L.x));
  f = f / (length(f) + 1e-4) * swirl * texture(uT, v).x; f.y = -f.y;
  o = vec4(texture(uV, v).xy + f * dt, 0.0, 1.0); }`;

export const divergence = `uniform sampler2D uT; uniform vec2 t;
void main() {${NB} o = vec4(0.5 * (R.x - L.x + T.y - B.y), 0.0, 0.0, 1.0); }`;

export const pressure = `uniform sampler2D uT, uDiv; uniform vec2 t;
void main() {${NB} o = vec4((L.x + R.x + B.x + T.x - texture(uDiv, v).x) * 0.25, 0.0, 0.0, 1.0); }`;

export const project = `uniform sampler2D uT, uV; uniform vec2 t;
void main() {${NB}
  // The water needs a wall somewhere. Without one, a stream can run in one edge and out
  // the other, and the swirl force feeds it until it is a gale.
  vec2 wall = step(t * 1.5, v) * step(v, 1.0 - t * 1.5);
  o = vec4((texture(uV, v).xy - vec2(R.x - L.x, T.x - B.x)) * wall.x * wall.y, 0.0, 1.0); }`;

export const scale = `uniform sampler2D uT; uniform float k;
void main() { o = k * texture(uT, v); }`;

// How long thick wine has stood on each spot of the paper. Thin wine that only passed
// over leaves the count alone.
export const steep = `uniform sampler2D uT, uD; uniform float rate;
void main() { vec4 d = texture(uD, v); o = texture(uT, v) + vec4(rate * smoothstep(0.5, 1.2, d.r + d.g), 0.0, 0.0, 0.0); }`;

// What the wine has done to the page under it (top row first): alpha is how far the page
// there is soaked away, green whether the deepest line of a place is out.
export const veil = `uniform sampler2D uT; uniform float gone, deepest;
void main() { float s = texture(uT, vec2(v.x, 1.0 - v.y)).r; o = vec4(0.0, step(deepest, s), 0.0, smoothstep(0.25 * gone, gone, s)); }`;

// The deep end: the whole page counts as having stood under wine at least this long
export const drown = `uniform sampler2D uT; uniform float k;
void main() { o = max(texture(uT, v), vec4(k)); }`;

// The page seen through moving water: whatever lies under it is carried a little way along
// with the flow. Written as a displacement map (top row first), grey where it is still.
export const bend = `uniform sampler2D uT; uniform float zoom, calm;
void main() {
  vec2 w = texture(uT, (vec2(v.x, 1.0 - v.y) - 0.5) / zoom + 0.5).xy;
  float m = length(w);
  w *= m / (m * m + calm * calm);   // slow water far from the pointer leaves the text alone
  o = vec4(0.5 - 0.5 * w.x, 0.5 + 0.5 * w.y, 0.5, 1.0); }`;

// Two pigments (crimson in r, violet in g) absorb light like real dye: thin is rosé,
// thick is near-black burgundy. The hidden lines are a wax resist: wine cannot stain them.
// Each place holds four lines, one under another (r, g, b, a of uText): the longer wine
// has stood on the middle of a place (box: x0, y0, x1, y1), the deeper the one that shows.
export const show = `uniform sampler2D uD, uText, uV, uSoak; uniform vec2 t; uniform vec3 depth; uniform vec4 box[8]; uniform float dark, dry, zoom, calm, shift;
const float WEAVE = 0.07;   // how plainly the paper's weave shows (0-1)
// Integer hash: the usual fract(sin()) one leaves a regular weave on some GPUs
float hash(vec2 p) {
  uint h = uint(p.x) * 374761393u + uint(p.y) * 668265263u;
  h = (h ^ (h >> 13)) * 1274126177u;
  return float((h ^ (h >> 16)) & 0xffffu) / 65535.0; }
// Linen: threads four pixels wide, no two alike, crossing over and under each other
float linen(vec2 p) {
  vec2 id = floor(p / 4.0), f = fract(p / 4.0);
  float thread = mod(id.x + id.y, 2.0) < 1.0
    ? sin(f.y * 3.1416) * (0.55 + 0.45 * hash(vec2(7.0, id.y)))
    : sin(f.x * 3.1416) * (0.55 + 0.45 * hash(vec2(id.x, 13.0)));
  return 0.75 * thread + 0.25 * hash(p); }
void main() {
  // Everything here lies under the water, which carries the sight of it a little way along
  // with the flow, the same way it does the page's text. Slow water far from the pointer does not.
  vec2 w = texture(uV, (v - 0.5) / zoom + 0.5).xy;
  float m = length(w);
  w *= m / (m * m + calm * calm) * shift;
  vec2 u = v - w * t;
  vec3 d = texture(uD, u).rgb;
  float dens = d.r + d.g;
  float gx = texture(uD, u + vec2(t.x, 0.0)).r + texture(uD, u + vec2(t.x, 0.0)).g - texture(uD, u - vec2(t.x, 0.0)).r - texture(uD, u - vec2(t.x, 0.0)).g;
  float gy = texture(uD, u + vec2(0.0, t.y)).r + texture(uD, u + vec2(0.0, t.y)).g - texture(uD, u - vec2(0.0, t.y)).r - texture(uD, u - vec2(0.0, t.y)).g;
  float edge = min(1.0, length(vec2(gx, gy)) * 4.0);            // pigment gathers at the rim
  float grain = linen(gl_FragCoord.xy);
  vec4 lines = texture(uText, u);
  float stood = 0.0;
  for (int i = 0; i < 8; i++) if (all(greaterThan(u, box[i].xy)) && all(lessThan(u, box[i].zw))) stood = textureLod(uSoak, 0.5 * (box[i].xy + box[i].zw), 0.0).r;
  vec3 sunk = smoothstep(depth, depth + 3.0, vec3(stood));
  float text = mix(mix(mix(lines.r, lines.g, sunk.x), lines.b, sunk.y), lines.a, sunk.z) * smoothstep(0.05, 0.5, dens);
  if (dark > 0.5) {
    // Night is day turned inside out: where day's pigment takes light away, night's gives
    // it. A thin film is straw gold, deep wine is nearly white, the lines stay dark in it.
    vec3 shine = d.r * vec3(1.9, 1.62, 1.2) + d.g * vec3(1.85, 1.64, 1.3);
    shine *= (1.0 + (0.4 + 1.1 * dry) * edge) * mix(0.7 + 0.6 * grain, 0.5 + 1.0 * grain, dry) * (1.0 - 0.2 * dry * (1.0 - edge)) * (1.0 - 0.93 * text);
    o = vec4((1.0 - exp(-shine)) * vec3(1.0, 0.965, 0.9), 1.0);
  } else {
    vec3 absorb = d.r * vec3(0.62, 3.1, 2.5) + d.g * vec3(1.5, 3.0, 1.0);
    // As it dries the pigment is drawn to the rim and into the weave, and the middle pales
    absorb *= (1.0 + (0.4 + 1.1 * dry) * edge) * mix(0.7 + 0.6 * grain, 0.5 + 1.0 * grain, dry) * (1.0 - 0.2 * dry * (1.0 - edge)) * (1.0 - 0.93 * text);
    o = vec4(exp(-absorb), 1.0);
  }
  // Clear water has nothing of its own to show. What gives it away on bare paper is the
  // paper: its weave, faint everywhere, is carried along like everything else.
  float weave = linen(gl_FragCoord.xy - w) - 0.5;
  if (dark > 0.5) o.rgb += WEAVE * weave * (1.0 - o.rgb);
  else o.rgb *= 1.0 - WEAVE * (0.5 - weave);
}`;
