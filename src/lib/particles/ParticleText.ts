import type { Particle, ParticleTextConfig } from './types';
import { createNoise2D } from './noise';
import { getBlendedPalette } from './palettes';
import { ENTRANCE } from '../constants';

const DEFAULT_CONFIG: ParticleTextConfig = {
  text: ENTRANCE.TEXT,
  fontFamily: ENTRANCE.FONT_FAMILY,
  fontWeight: ENTRANCE.FONT_WEIGHT,
  maxFontSize: ENTRANCE.MAX_FONT_SIZE,
  fontSizeRatio: ENTRANCE.FONT_SIZE_RATIO,
  skipProbability: ENTRANCE.SKIP_PROBABILITY,
  mouseRadius: ENTRANCE.MOUSE_RADIUS,
  springForce: ENTRANCE.SPRING_FORCE,
  damping: ENTRANCE.DAMPING,
  repulsion: ENTRANCE.REPULSION,
  noiseScale: ENTRANCE.NOISE_SCALE,
  noiseDrift: ENTRANCE.NOISE_DRIFT,
  cycleFrames: ENTRANCE.CYCLE_FRAMES,
};

export class ParticleText {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private config: ParticleTextConfig;
  private noise = createNoise2D();
  private particles: Particle[] = [];
  private mouse = { x: -9999, y: -9999 };
  private frame = 0;
  private rafId = 0;
  private running = false;
  private W = 0;
  private H = 0;
  private resizeTimer = 0;

  /** Hook for external performance monitoring. Called each frame with timestamp. */
  onFrame?: (time: number) => void;

  /** When true, darkens the canvas background for dark mode. */
  darkMode = false;

  constructor(canvas: HTMLCanvasElement, config?: Partial<ParticleTextConfig>) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx = ctx;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    await document.fonts.ready;
    this.setupSize();
    this.buildParticles();
    this.loop(performance.now());
  }

  stop(): void {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  dispose(): void {
    this.stop();
    clearTimeout(this.resizeTimer);
    this.particles = [];
  }

  resize(): void {
    clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(() => {
      if (!this.running) return;
      this.setupSize();
      this.buildParticles();
    }, 300);
  }

  onMouseMove(clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = clientX - rect.left;
    this.mouse.y = clientY - rect.top;
  }

  onMouseLeave(): void {
    this.mouse.x = -9999;
    this.mouse.y = -9999;
  }

  private setupSize(): void {
    const dpr = window.devicePixelRatio || 1;
    // Use window dimensions directly — this is a fullscreen splash
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.canvas.width = this.W * dpr;
    this.canvas.height = this.H * dpr;
    this.canvas.style.width = this.W + 'px';
    this.canvas.style.height = this.H + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private buildParticles(): void {
    const { W, H, config } = this;
    this.particles = [];

    const off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    const o = off.getContext('2d')!;

    const fs = Math.min(W * config.fontSizeRatio, config.maxFontSize);
    o.font = `${config.fontWeight} ${fs}px ${config.fontFamily}`;
    o.fillStyle = '#000';
    o.textAlign = 'center';
    o.textBaseline = 'middle';
    o.fillText(config.text, W / 2, H / 2);

    const data = o.getImageData(0, 0, W, H).data;
    const gap = Math.max(3, Math.round(W / 280));
    // Scale particle size relative to viewport (baseline: 1000px short side)
    const sizeScale = Math.min(W, H) / 1000;

    for (let y = 0; y < H; y += gap) {
      for (let x = 0; x < W; x += gap) {
        if (data[(y * W + x) * 4 + 3] > 128) {
          if (Math.random() > config.skipProbability) continue;

          const r = Math.random();
          const size = (r < 0.05
            ? 12 + Math.random() * 8
            : r < 0.25
              ? 8 + Math.random() * 5
              : 5 + Math.random() * 4) * sizeScale;

          this.particles.push({
            hx: x,
            hy: y,
            x: x + (Math.random() - 0.5) * W * 0.5,
            y: y + (Math.random() - 0.5) * H * 0.5,
            vx: 0,
            vy: 0,
            size,
            jh: (Math.random() - 0.5) * 15,
            js: (Math.random() - 0.5) * 8,
            jl: (Math.random() - 0.5) * 10,
            alpha: 0.45 + Math.random() * 0.30,
            phase: Math.random() * Math.PI * 2,
            breathSpeed: 0.006 + Math.random() * 0.011,
          });
        }
      }
    }

    this.particles.sort((a, b) => b.size - a.size);
  }

  private loop = (time: number): void => {
    if (!this.running) return;
    this.onFrame?.(time);
    this.update();
    this.render();
    this.rafId = requestAnimationFrame(this.loop);
  };

  private update(): void {
    this.frame++;
    const { config, mouse, particles } = this;
    const mr2 = config.mouseRadius * config.mouseRadius;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      let fx = (p.hx - p.x) * config.springForce;
      let fy = (p.hy - p.y) * config.springForce;

      const dx = p.x - mouse.x;
      const dy = p.y - mouse.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < mr2 && d2 > 1) {
        const f = config.repulsion / d2;
        const d = Math.sqrt(d2);
        fx += (dx / d) * f;
        fy += (dy / d) * f;
      }

      p.vx = (p.vx + fx) * config.damping;
      p.vy = (p.vy + fy) * config.damping;
      p.x += p.vx;
      p.y += p.vy;
    }
  }

  private render(): void {
    const { ctx, W, H, frame, config, noise, particles } = this;
    const cycleT = (frame / config.cycleFrames) % 1;
    const blend = getBlendedPalette(cycleT);

    const bgR = this.darkMode ? blend.bg[0] * 0.07 + 6 : blend.bg[0];
    const bgG = this.darkMode ? blend.bg[1] * 0.07 + 4 : blend.bg[1];
    const bgB = this.darkMode ? blend.bg[2] * 0.07 + 2 : blend.bg[2];
    ctx.fillStyle = `rgb(${Math.round(bgR)},${Math.round(bgG)},${Math.round(bgB)})`;
    ctx.fillRect(0, 0, W, H);

    const timeOff = frame * config.noiseDrift;
    const hueCount = blend.hues.length;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const nv = noise(p.hx * config.noiseScale + timeOff, p.hy * config.noiseScale + timeOff * 0.7);
      const v = (nv + 1) / 2;
      const idx = v * (hueCount - 1);
      const ii = Math.floor(idx);
      const ff = idx - ii;

      const ca = blend.hues[Math.min(ii, hueCount - 1)];
      const cb = blend.hues[Math.min(ii + 1, hueCount - 1)];
      const ch = ca.h + (cb.h - ca.h) * ff + p.jh;
      const cs = ca.s + (cb.s - ca.s) * ff + p.js;
      const cl = ca.l + (cb.l - ca.l) * ff + p.jl;

      const br = Math.sin(p.phase + frame * p.breathSpeed);
      const s = p.size * (0.86 + br * 0.14);
      const dh = Math.sqrt((p.x - p.hx) ** 2 + (p.y - p.hy) ** 2);
      const al = p.alpha * (0.85 + br * 0.15 + Math.min(1, dh / 50) * 0.3);

      ctx.beginPath();
      ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${Math.round(ch)},${Math.round(cs + br * 5)}%,${Math.round(cl + br * 5)}%,${al.toFixed(3)})`;
      ctx.fill();
    }
  }
}
