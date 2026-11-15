/**
 * The page lies under a sheet of water. The water is clear, so it shows only in how it
 * bends what is under it: the page's text, the weave of the paper, a dried stain.
 * Now and then wine wells up into it, spreads, curls, and dries into a stain. Hidden lines
 * show only where the wine has stained the paper, and deeper ones where it has stood long.
 * Where it stands, what was printed on the page soaks away, links and all. Once wine has come,
 * pressing pours more. When nearly the whole page is gone the rest goes at once: the wine
 * stays just as it is, every place shows its deepest line, and pressing pours no more.
 * WebGL2 stable fluids; the pointer pushes the water wherever it moves.
 */
import * as GLSL from './shaders';

interface Target { tex: WebGLTexture; fbo: WebGLFramebuffer; w: number; h: number }
interface Pair { read: Target; write: Target; swap(): void }
interface Program { p: WebGLProgram; u: Record<string, WebGLUniformLocation | null> }
type Uniform = number | number[] | Float32Array | WebGLTexture;
interface Seep {
  x: number; y: number; age: number; open: number; flow: number; grown: number; turn: number;
  lobes: number[]; eddies: { a: number; far: number; spin: number }[];
}
interface Box { x0: number; x1: number; y0: number; y1: number }

const CELL = 5;        // dye pixels per simulation cell
const ZOOM = 2;        // the water is this much wider and taller than the page, so its walls are far off
const SPRING = 300;    // how fast a pool grows
const EDDY = 22;       // how hard the eddies in a pool turn
const VIOLET = 0.6;    // share of violet pigment in the wine
const DT = 1 / 60;     // simulated time per step
const RATE = 165;      // steps per real second (the pace the look was tuned at)
const HOLD = 8;        // a press pours for this much simulated time at most
const DRY = 25;        // simulated time for still wine to dry into a stain
const SHIFT = 10;      // the furthest the water carries what is under it (CSS px)
const CALM = 70;       // flow (cells per second) at which things are carried half that far
// Simulated time thick wine must stand on a place before its second, third and fourth line shows
const DEPTH = [6, 25, 50];
const GONE = 8;        // and how long before what was printed there is soaked away
const LOST = 0.9;      // with this share of the page soaked away, the rest goes too
const PLACES = 8;      // hidden lines on a page

const rand = Math.random;

/** `n` heights down the page between `lo` and `hi`, in no order, no two closer than `gap`. */
function apart(n: number, lo: number, hi: number, gap: number): number[] {
  const ys = Array.from({ length: n }, () => lo + rand() * (hi - lo - (n - 1) * gap)).sort((a, b) => a - b).map((y, i) => y + i * gap);
  return ys.sort(() => rand() - 0.5);
}

/**
 * Where the hidden lines sit, scattered afresh on every visit: [x, y, size] with x and y as
 * fractions of the page (text centred on the point) and size a share of the usual one.
 * A wide page has margins for them; a tall one has none, so they wander down the middle.
 */
function scatter(tall: boolean): number[][] {
  if (tall) return apart(PLACES, 0.07, 0.94, 0.085).map((y) => [0.38 + rand() * 0.24, y, 0.85 + rand() * 0.15]);
  const left = 3 + Math.floor(rand() * 3);
  return [
    ...apart(left, 0.1, 0.92, 0.12).map((y) => [0.09 + rand() * 0.18, y]),
    ...apart(PLACES - left, 0.1, 0.92, 0.12).map((y) => [0.73 + rand() * 0.18, y]),
  ].map(([x, y]) => [x, y, 0.85 + rand() * 0.35]);
}

export class WineEffect {
  /** Called with the place whose fourth line was clicked, once the wine has brought it out. */
  onLine: ((place: number) => void) | null = null;
  /** Paper laid over what the wine has soaked away. Goes on the page just under the wine's canvas. */
  readonly veil = document.createElement('canvas');
  /** How many times faster than usual the wine soaks in. For looking at the deep end without the wait. */
  haste = 1;

  private gl: WebGL2RenderingContext;
  private prog: Record<Exclude<keyof typeof GLSL, 'VERTEX' | 'FRAGMENT_HEADER'>, Program>;
  private vel!: Pair;
  private dye!: Pair;
  private soak!: Pair;      // how long thick wine has stood on each spot
  private stood = 0;        // time not yet added to that: half floats cannot take it a step at a time
  private soaked!: Target;  // what that has done to the page, and its pixels
  private soakedPixels!: Uint8ClampedArray<ArrayBuffer>;
  private stale = true;     // the veil is behind the soak
  private turning = false;  // the page is lost: the deep end
  private view = [0, 0];    // the size of the canvas on the page (CSS px) that the buffers were built for
  private sized = new ResizeObserver(() => { if (this.canvas.clientWidth !== this.view[0] || this.canvas.clientHeight !== this.view[1]) this.init(); });
  private prs!: Pair;
  private tmpC!: Target;
  private tmpD!: Target;
  private textTex: WebGLTexture | null = null;
  private sim = [0, 0];
  private aspect = 1;
  private boxes: Box[] = [];
  private spots = { wide: scatter(false), tall: scatter(true) };
  private seeps: Seep[] = [];
  private held: Seep | null = null;   // the source under the pointer while it is pressed
  private mine: Seep | null = null;   // the pointer's one source: a new press moves it rather than opening another
  private last: { x: number; y: number } | null = null;
  private wet = 0;
  private dry = 0;
  private poured = false;   // has any wine come up yet
  private ripple = 0;       // fades after the pointer's last move; the text bends while it lasts
  private refracting = false;
  private bent!: Target;    // the flow as a displacement map
  private bentPixels!: Uint8ClampedArray<ArrayBuffer>;
  private flowMap = document.createElement('canvas');
  private lens: Element | null = null;   // the SVG filter that bends the page by that map
  private theme = new MutationObserver(() => { this.render(); this.drawVeil(); });
  private raf = 0;
  private clock = 0;
  private owed = 0;
  private listeners = new AbortController();

  /**
   * `lines` holds, for each place in the margins, its lines from shallow to deep: three, and
   * a fourth if the place leads somewhere. The canvas must already be on the page: the water
   * is as large as it is there. `page` is the element whose content lies under the water. The
   * water bends it as it moves, unless `bends` is false (a touch screen has nothing to stir
   * clear water with).
   * Throws when the browser cannot run it (no WebGL2 or no float render targets).
   */
  constructor(private canvas: HTMLCanvasElement, private lines: string[][], private page: HTMLElement, bends = true) {
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false });
    if (!gl || !(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'))) throw new Error('WebGL2 float targets unavailable');
    this.gl = gl;
    const { VERTEX, FRAGMENT_HEADER, ...fragments } = GLSL;
    this.prog = Object.fromEntries(
      Object.entries(fragments).map(([name, fs]) => [name, this.program(VERTEX, FRAGMENT_HEADER + fs)]),
    ) as typeof this.prog;

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.veil.className = 'wine-veil';
    if (bends) {
      document.body.insertAdjacentHTML('beforeend', `<svg width="0" height="0" style="position: absolute">
        <filter id="wine-water" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
          <feImage preserveAspectRatio="none" result="flow" />
          <feDisplacementMap in="SourceGraphic" in2="flow" scale="${SHIFT * 2}" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>`);
      this.lens = document.body.lastElementChild!;
    }

    this.init();
    this.sized.observe(canvas);
    this.theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const on: AddEventListenerOptions = { signal: this.listeners.signal };
    addEventListener('pointerdown', this.press, on);
    addEventListener('pointerup', this.release, on);
    addEventListener('pointercancel', this.release, on);
    addEventListener('blur', this.release, on);
    addEventListener('pointermove', this.move, on);
    addEventListener('click', this.click, { ...on, capture: true });
  }

  /** Open a source at a point of the page (fractions, y up) for `open` simulated seconds. */
  seep(x: number, y: number, open: number): Seep {
    const eddies = [];
    for (let i = 0, a = rand() * 6.28; i < 7; i++, a += 0.6 + rand() * 0.6) eddies.push({ a, far: 0.5 + rand() * 0.45, spin: rand() < 0.5 ? 1 : -1 });
    const s = { x, y, age: 0, open, flow: 0, grown: 0, eddies, turn: rand() * 6.28, lobes: [rand() * 6.28, rand() * 6.28, rand() * 6.28] };
    this.seeps.push(s);
    this.poured = true;
    this.start();
    return s;
  }

  start(): void {
    if (this.raf) return;
    this.clock = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.listeners.abort();
    this.theme.disconnect();
    this.sized.disconnect();
    this.lens?.remove();
    this.page.style.filter = '';
    this.canvas.parentElement?.classList.remove('wine-gone');
    document.documentElement.style.cursor = '';
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }

  // ── WebGL plumbing ─────────────────────────────────────

  private program(vs: string, fs: string): Program {
    const gl = this.gl, p = gl.createProgram()!;
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
      gl.attachShader(p, s);
    }
    gl.bindAttribLocation(p, 0, 'a');
    gl.linkProgram(p);
    const u: Program['u'] = {};
    for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i++) {
      const name = gl.getActiveUniform(p, i)!.name;
      u[name.replace('[0]', '')] = gl.getUniformLocation(p, name);
    }
    return { p, u };
  }

  private target(w: number, h: number, bytes = false): Target {
    const gl = this.gl, tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (bytes) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.LINEAR);
    for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex, fbo, w, h };
  }

  private pair(w: number, h: number): Pair {
    return { read: this.target(w, h), write: this.target(w, h), swap() { [this.read, this.write] = [this.write, this.read]; } };
  }

  /** Run a program into a target (null = screen). Textures are bound in the order given. */
  private pass(P: Program, to: Target | null, uniforms: Record<string, Uniform>): void {
    const gl = this.gl;
    gl.useProgram(P.p);
    let unit = 0;
    for (const k in uniforms) {
      const loc = P.u[k], val = uniforms[k];
      if (loc == null) continue;
      if (val instanceof WebGLTexture) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, val); gl.uniform1i(loc, unit++); }
      else if (val instanceof Float32Array) gl.uniform4fv(loc, val);
      else if (typeof val === 'number') gl.uniform1f(loc, val);
      else if (val.length === 2) gl.uniform2f(loc, val[0], val[1]);
      else gl.uniform3f(loc, val[0], val[1], val[2]);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, to ? to.fbo : null);
    gl.viewport(0, 0, to ? to.w : this.canvas.width, to ? to.h : this.canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // ── state ──────────────────────────────────────────────

  /** (Re)build every buffer for the canvas as it now lies on the page. The wine already there is carried over. */
  private init = (): void => {
    const gl = this.gl, canvas = this.canvas;
    const free = (b: Target) => { gl.deleteTexture(b.tex); gl.deleteFramebuffer(b.fbo); };
    const kept = this.dye && [this.dye.read, this.soak.read];
    if (this.dye) [this.vel.read, this.vel.write, this.prs.read, this.prs.write, this.tmpC, this.tmpD, this.dye.write, this.soak.write, this.bent, this.soaked].forEach(free);
    const [wide, high] = this.view = [canvas.clientWidth, canvas.clientHeight];
    const k = Math.min(1, 1400 / wide) * Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(wide * k);
    canvas.height = Math.round(high * k);
    this.aspect = canvas.width / canvas.height;
    const sw = Math.ceil(canvas.width / CELL * ZOOM), sh = Math.ceil(canvas.height / CELL * ZOOM);
    this.sim = [1 / sw, 1 / sh];
    this.vel = this.pair(sw, sh); this.prs = this.pair(sw, sh);
    this.tmpC = this.target(sw, sh); this.tmpD = this.target(sw, sh);
    this.bent = this.target(Math.round(sw / ZOOM), Math.round(sh / ZOOM), true);
    this.flowMap.width = this.bent.w; this.flowMap.height = this.bent.h;
    this.bentPixels = new Uint8ClampedArray(this.bent.w * this.bent.h * 4);
    this.dye = this.pair(canvas.width, canvas.height);
    this.soak = this.pair(Math.ceil(canvas.width / CELL), Math.ceil(canvas.height / CELL));
    if (kept) [this.dye, this.soak].forEach((to, i) => { this.pass(this.prog.scale, to.read, { uT: kept[i].tex, k: 1 }); free(kept[i]); });
    const { w, h } = this.soak.read;
    this.soaked = this.target(w, h, true);
    this.soakedPixels = new Uint8ClampedArray(w * h * 4);
    this.veil.width = w; this.veil.height = h;

    if (this.textTex) gl.deleteTexture(this.textTex);
    this.textTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.textTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.drawLines());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.render();
    this.drawVeil();
  };

  /**
   * The hidden lines as a texture the size of the dye (bottom row first), each depth in a
   * channel of its own, and the box on the page that holds each place's lines.
   */
  private drawLines(): Uint8Array {
    const c = document.createElement('canvas'), w = (c.width = this.canvas.width), h = (c.height = this.canvas.height);
    const wide = this.view[0], tall = wide < this.view[1], at = tall ? this.spots.tall : this.spots.wide;
    // Sixteen characters must fit: across a tall page, or in the margin of a wide one
    const ctx = c.getContext('2d', { willReadFrequently: true })!, size = Math.round(Math.min(21, Math.max(15, wide / (tall ? 21.5 : 66))) * w / wide);
    const family = getComputedStyle(document.body).fontFamily;
    const pen = (i: number) => { const px = size * at[i][2]; ctx.font = `${px}px ${family}`; ctx.letterSpacing = `${px * 0.1}px`; return px; };
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const places = this.lines.slice(0, at.length), out = new Uint8Array(w * h * 4);
    this.boxes = places.map((lines, i) => {
      const px = pen(i), half = Math.max(...lines.map((line) => ctx.measureText(line).width)) / w / 2 + 0.01, high = px / h * 0.8;
      const x = Math.min(Math.max(at[i][0], half), 1 - half), y = at[i][1];   // never off the edge of the page
      return { x0: x - half, x1: x + half, y0: 1 - y - high, y1: 1 - y + high };   // y up, like the pointer
    });
    for (let depth = 0; depth < 4; depth++) {
      ctx.clearRect(0, 0, w, h);
      places.forEach((lines, i) => { pen(i); ctx.fillText(lines[Math.min(depth, lines.length - 1)], (this.boxes[i].x0 + this.boxes[i].x1) / 2 * w, at[i][1] * h); });
      const drawn = ctx.getImageData(0, 0, w, h).data;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[((h - 1 - y) * w + x) * 4 + depth] = drawn[(y * w + x) * 4 + 3];
    }
    return out;
  }

  private addSplat(buf: Pair, x: number, y: number, amount: number[], radius: number): void {
    this.pass(this.prog.splat, buf.write, { uT: buf.read.tex, point: [x, y], amount, radius, aspect: this.aspect });
    buf.swap();
  }

  /** Push the water at a point on the page (page coordinates, like the dye). */
  private push(x: number, y: number, force: number[], radius: number): void {
    this.addSplat(this.vel, (x - 0.5) / ZOOM + 0.5, (y - 0.5) / ZOOM + 0.5, force, radius / (ZOOM * ZOOM));
  }

  /** Where a source is right now. It strays a little, so the rings are never true circles. */
  private mouth(s: Seep): number[] {
    return [s.x + Math.cos(s.age * 2.3 + s.turn) * 0.008 / this.aspect, s.y + Math.sin(s.age * 3.1 + s.turn) * 0.008];
  }

  /** A source opens within a fraction of a second, spreads on every side in rings, and eases off once it closes. */
  private well(dt: number): void {
    const { seeps, dye, prog, aspect } = this;
    for (let i = seeps.length - 1; i >= 0; i--) {
      const s = seeps[i];
      s.age += dt;
      const on = s.age < s.open;
      s.flow += ((on ? 1 : 0) - s.flow) * dt * (on ? 5 : 2.2);
      if (!on && s.flow < 0.01) { seeps.splice(i, 1); continue; }
      const c = s.flow * s.flow * (1.5 + 0.4 * Math.sin(s.age * 6));   // it comes in pulses, which travel outward as rings
      const [mx, my] = this.mouth(s);
      this.pass(prog.soak, dye.write, { uT: dye.read.tex, point: [mx, my], amount: [c * (1 - VIOLET), c * VIOLET, 0], radius: 0.0005, aspect }); dye.swap();
      this.wet = Math.max(this.wet, s.flow);
      // A ring of eddies rides outward with the pool, some turning one way and some the other.
      // Each is a pair of opposite shoves, so it twists the water without sending it anywhere.
      s.grown += s.flow * s.flow * dt;
      const reach = Math.sqrt(2 * SPRING * s.grown) * this.sim[1] * ZOOM, f = EDDY * s.flow;
      for (const e of s.eddies) {
        const cx = Math.cos(e.a), cy = Math.sin(e.a), d = reach * e.far;
        for (const side of [1, -1]) {
          const r = d + side * 0.012;
          this.push(mx + cx * r / aspect, my + cy * r, [-cy * f * e.spin * side, cx * f * e.spin * side, 0], 0.0005);
        }
      }
    }
  }

  /**
   * Fresh wine curls for a while, then soaks in. Once nothing wells up any more it dries
   * into a stain that no stirring can move, though the water still runs over it.
   */
  private step(dt: number): void {
    const { prog, vel, prs, dye, tmpC, tmpD, sim: t } = this;
    this.wet *= 0.985;
    this.ripple *= 0.97;
    this.dry = this.seeps.length || !this.poured ? Math.max(0, this.dry - dt * 2) : Math.min(1, this.dry + dt / DRY);
    const live = Math.min(1, this.wet * 4) * (1 - this.dry);   // how freely the wine still moves
    this.well(dt);
    this.pass(prog.curl, tmpC, { uT: vel.read.tex, t });
    this.pass(prog.forces, vel.write, { uT: tmpC.tex, uV: vel.read.tex, t, dt, swirl: 12 * live }); vel.swap();
    this.pass(prog.divergence, tmpD, { uT: vel.read.tex, t });
    this.pass(prog.scale, prs.write, { uT: prs.read.tex, k: 0.8 }); prs.swap();
    for (let i = 0; i < 22; i++) { this.pass(prog.pressure, prs.write, { uT: prs.read.tex, uDiv: tmpD.tex, t }); prs.swap(); }
    this.pass(prog.project, vel.write, { uT: prs.read.tex, uV: vel.read.tex, t }); vel.swap();
    this.pass(prog.advect, vel.write, { uV: vel.read.tex, uS: vel.read.tex, t, dt, keep: 0.97 + 0.026 * live, zoom: 1 }); vel.swap();   // clear water settles in a moment
    let flow = vel.read, spare = tmpC;
    for (const s of this.seeps) {
      this.pass(prog.spring, spare, { uT: flow.tex, point: this.mouth(s).map((p) => (p - 0.5) / ZOOM + 0.5), t, phase: s.lobes, strength: SPRING * s.flow * s.flow });
      [flow, spare] = [spare, flow === vel.read ? tmpD : flow];
    }
    this.pass(prog.advect, dye.write, { uV: flow.tex, uS: dye.read.tex, t, dt: dt * (1 - this.dry), keep: this.turning ? 1 : 1 - 0.0001 * live, zoom: ZOOM }); dye.swap();   // moving wine thins, until the deep end
    this.stood += dt * (1 - this.dry) * this.haste;
    if (this.stood > 0.5) { this.pass(prog.steep, this.soak.write, { uT: this.soak.read.tex, uD: dye.read.tex, rate: this.stood }); this.soak.swap(); this.stood = 0; this.stale = true; }
  }

  /** Lay paper over whatever the wine has soaked away. */
  private drawVeil(): void {
    const { gl, soaked, veil } = this, ctx = veil.getContext('2d')!;
    this.pass(this.prog.veil, soaked, { uT: this.soak.read.tex, gone: GONE, deepest: DEPTH[2] + 1.5 });
    gl.readPixels(0, 0, soaked.w, soaked.h, gl.RGBA, gl.UNSIGNED_BYTE, this.soakedPixels);
    let lost = 0;
    for (let i = 3; i < this.soakedPixels.length; i += 4) if (this.soakedPixels[i] > 127) lost++;
    if (!this.turning && lost >= LOST * soaked.w * soaked.h) {
      // The deep end. No more wells up, the wine stays as it is, and the whole page has stood long enough
      this.turning = true;
      for (const s of this.seeps) s.open = Math.min(s.open, s.age);
      this.held = null;
      this.pass(this.prog.drown, this.soak.write, { uT: this.soak.read.tex, k: DEPTH[2] + 3 }); this.soak.swap();
      this.render();
      return this.drawVeil();
    }
    ctx.globalCompositeOperation = 'copy';
    ctx.putImageData(new ImageData(this.soakedPixels, soaked.w, soaked.h), 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = getComputedStyle(document.body).backgroundColor;
    ctx.fillRect(0, 0, veil.width, veil.height);
    this.stale = false;
  }

  private render(): void {
    const dark = document.documentElement.dataset.theme === 'dark' ? 1 : 0;
    this.pass(this.prog.show, null, {
      uD: this.dye.read.tex, uText: this.textTex!, uV: this.vel.read.tex, uSoak: this.soak.read.tex, depth: DEPTH, box: new Float32Array(32).fill(0).map((_, i) => { const b = this.boxes[i >> 2]; return b ? [b.x0, b.y0, b.x1, b.y1][i & 3] : 0; }), t: [1 / this.canvas.width, 1 / this.canvas.height],
      dark, dry: this.dry, zoom: ZOOM, calm: CALM, shift: SHIFT * this.canvas.width / this.view[0],
    });
  }

  /** Bend the page's text by the water's flow, for as long as the water is moving. */
  private refract(): void {
    const { gl, bent, page, flowMap, lens } = this;
    if (!lens) return;
    if (this.ripple < 0.02) {
      if (this.refracting) { page.style.filter = ''; this.refracting = false; }
      return;
    }
    this.pass(this.prog.bend, bent, { uT: this.vel.read.tex, zoom: ZOOM, calm: CALM });
    gl.readPixels(0, 0, bent.w, bent.h, gl.RGBA, gl.UNSIGNED_BYTE, this.bentPixels);
    flowMap.getContext('2d')!.putImageData(new ImageData(this.bentPixels, bent.w, bent.h), 0, 0);
    // The map covers the canvas, in the page element's own coordinates
    const box = page.getBoundingClientRect(), on = this.canvas.getBoundingClientRect();
    const area = { x: on.left - box.left, y: on.top - box.top, width: on.width, height: on.height };
    const filter = lens.firstElementChild!, image = filter.firstElementChild!;
    for (const node of [filter, image]) for (const [k, n] of Object.entries(area)) node.setAttribute(k, String(n));
    image.setAttribute('href', flowMap.toDataURL());
    if (!this.refracting) { page.style.filter = 'url(#wine-water)'; this.refracting = true; }
  }

  /** Steps at a fixed pace whatever the display's refresh rate, and rests once the water is still and the stain dry. */
  private frame = (now: number): void => {
    this.owed = Math.min(this.owed + (now - this.clock) / 1000 * RATE, 4);
    this.clock = now;
    for (; this.owed >= 1; this.owed--) this.step(DT);
    this.render();
    if (this.stale) this.drawVeil();
    this.refract();
    const awake = this.seeps.length || (this.poured && this.dry < 1) || this.ripple >= 0.02;
    this.raf = awake ? requestAnimationFrame(this.frame) : 0;
  };

  // ── input ──────────────────────────────────────────────

  /** Where the pointer is on the canvas: fractions, y up. */
  private at = (e: MouseEvent): [number, number] => {
    const on = this.canvas.getBoundingClientRect();
    return [(e.clientX - on.left) / on.width, 1 - (e.clientY - on.top) / on.height];
  };

  private press = (e: PointerEvent): void => {
    if (!this.poured || this.turning) return;   // clear water has no wine to give, and at the deep end there is no more to pour
    const [x, y] = this.at(e);
    if (this.mine && this.seeps.includes(this.mine)) Object.assign(this.mine, { x, y, open: this.mine.age + HOLD, grown: 0 });
    else this.mine = this.seep(x, y, HOLD);
    this.held = this.mine;
  };

  private release = (e: Event): void => {
    if (this.held) this.held.open = Math.min(this.held.open, Math.max(this.held.age, 0.6));
    this.held = null;
    if (e instanceof PointerEvent && e.pointerType !== 'mouse') this.last = null;   // a finger comes down somewhere else next time
  };

  private move = (e: PointerEvent): void => {
    const [x, y] = this.at(e);
    if (this.held) [this.held.x, this.held.y] = [x, y];
    if (this.last) {
      this.push(x, y, [(e.clientX - this.last.x) * 2.2, -(e.clientY - this.last.y) * 2.2, 0], 0.0016);
      this.ripple = 1;
      if (this.poured) this.wet = Math.max(this.wet, 0.25);   // stirring wakes the wine again
      this.start();
    }
    this.last = { x: e.clientX, y: e.clientY };
    const place = this.overLine(e);
    document.documentElement.style.cursor = place < 0 ? '' : 'pointer';
    this.canvas.parentElement!.classList.toggle('wine-gone', place < 0 && this.gone(e));   // nothing left there to point at
  };

  private click = (e: MouseEvent): void => {
    const place = this.overLine(e), gone = this.gone(e);
    if (place < 0 && !gone) return;
    e.preventDefault();      // what was printed here is gone, and its links with it
    e.stopPropagation();
    if (place >= 0) this.onLine?.(place);
  };

  /** What the wine has done to the page at a point: how far it is soaked away, and whether a deepest line there would be out (each 0 to 255). */
  private under(x: number, y: number): [number, number] {
    if (x < 0 || x >= 1 || y <= 0 || y > 1) return [0, 0];
    const { w, h } = this.soaked, i = (Math.floor((1 - y) * h) * w + Math.floor(x * w)) * 4;
    return [this.soakedPixels[i + 3], this.soakedPixels[i + 1]];
  }

  /** Is the pointer on something under the wine that it has soaked away? */
  private gone(e: MouseEvent): boolean {
    return e.target instanceof Node && this.canvas.parentElement!.contains(e.target) && this.under(...this.at(e))[0] > 127;
  }

  /** The place the pointer is on, if it has a fourth line and wine has stood there long enough to show it. Else -1. */
  private overLine(e: MouseEvent): number {
    const [x, y] = this.at(e);
    const place = this.boxes.findIndex((b, i) => this.lines[i].length > 3 && x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1);
    if (place < 0) return -1;
    const b = this.boxes[place];
    return this.under((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2)[1] > 127 ? place : -1;
  }
}
