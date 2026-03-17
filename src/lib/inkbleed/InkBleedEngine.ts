import type { InkBleedConfig } from './types';
import { INK_BLEED, TIMING } from '../constants';

const SVG_NS = 'http://www.w3.org/2000/svg';

const DEFAULT_CONFIG: InkBleedConfig = {
  appearDelay: TIMING.INK_BLEED_DELAY,
  revealDuration: INK_BLEED.REVEAL_DURATION,
  revealInterval: INK_BLEED.REVEAL_INTERVAL,
  floodDuration: INK_BLEED.FLOOD_DURATION,
  noiseFrequency: INK_BLEED.NOISE_FREQUENCY,
  noiseOctaves: INK_BLEED.NOISE_OCTAVES,
  stainColor: INK_BLEED.STAIN_COLOR,
  groupOpacity: INK_BLEED.GROUP_OPACITY,
};

/** Build feFuncA tableValues string for a given reveal progress (0→1). */
function buildTableValues(progress: number): string {
  const n = 10;
  const values: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const threshold = 1 - progress;
    if (t < threshold) {
      values.push(0);
    } else {
      const above = (t - threshold) / (1 - threshold + 0.001);
      values.push(Math.min(1, above * progress * 1.5));
    }
  }
  return values.map((v) => v.toFixed(3)).join(' ');
}

/** Events that count as "movement" — stains vanish */
const MOVE_EVENTS = ['mousemove', 'keydown', 'scroll', 'touchstart', 'touchmove'] as const;

export class InkBleedEngine {
  private container: HTMLElement;
  private config: InkBleedConfig;
  private svg: SVGSVGElement | null = null;
  private funcA: SVGFEFuncAElement | null = null;
  private noiseSeed = 0;
  private delayTimer = 0;
  private revealTimer = 0;
  private revealProgress = 0;
  private started = false;
  private visible = false; // stains currently showing
  private flooded = false;
  private resizeTimer = 0;
  private moveHandler: (() => void) | null = null;
  private clickHandler: ((e: Event) => void) | null = null;
  private resizeHandler: (() => void) | null = null;
  private focusHandler: (() => void) | null = null;
  private blurHandler: (() => void) | null = null;

  onFlood?: () => void;

  constructor(container: HTMLElement, config?: Partial<InkBleedConfig>) {
    this.container = container;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.noiseSeed = Math.floor(Math.random() * 999);
  }

  start(): void {
    if (this.started) return;
    this.started = true;

    // Movement → hide stains + restart idle timer
    this.moveHandler = () => {
      if (this.flooded) return;
      if (this.visible) {
        this.hideStains();
      }
      this.resetDelayTimer();
    };
    for (const evt of MOVE_EVENTS) {
      document.addEventListener(evt, this.moveHandler);
    }

    // Click → flood (only when stains are visible)
    this.clickHandler = (e: Event) => {
      if (this.flooded || !this.visible) return;
      e.preventDefault();
      e.stopPropagation();
      this.flood();
    };
    document.addEventListener('click', this.clickHandler);
    document.addEventListener('touchend', this.clickHandler);

    // Focus/blur
    this.blurHandler = () => {
      clearTimeout(this.delayTimer);
      clearInterval(this.revealTimer);
    };
    this.focusHandler = () => {
      if (!document.hasFocus() || this.flooded) return;
      if (this.visible && this.revealProgress < 1) {
        this.resumeReveal();
      } else {
        this.resetDelayTimer();
      }
    };
    window.addEventListener('focus', this.focusHandler);
    window.addEventListener('blur', this.blurHandler);

    this.resizeHandler = () => {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = window.setTimeout(() => this.handleResize(), 300);
    };
    window.addEventListener('resize', this.resizeHandler);

    if (!document.hasFocus()) return;
    this.resetDelayTimer();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    clearTimeout(this.delayTimer);
    clearTimeout(this.resizeTimer);
    clearInterval(this.revealTimer);

    if (this.moveHandler) {
      for (const evt of MOVE_EVENTS) {
        document.removeEventListener(evt, this.moveHandler);
      }
    }
    if (this.clickHandler) {
      document.removeEventListener('click', this.clickHandler);
      document.removeEventListener('touchend', this.clickHandler);
    }
    if (this.focusHandler) window.removeEventListener('focus', this.focusHandler);
    if (this.blurHandler) window.removeEventListener('blur', this.blurHandler);
    if (this.resizeHandler) window.removeEventListener('resize', this.resizeHandler);
  }

  dispose(): void {
    this.stop();
    this.removeSVG();
    this.visible = false;
    this.flooded = false;
    this.revealProgress = 0;
  }

  private resetDelayTimer(): void {
    clearTimeout(this.delayTimer);
    if (this.flooded) return;
    this.delayTimer = window.setTimeout(() => this.showStains(), this.config.appearDelay);
  }

  /** Stains appear — build SVG and start reveal animation */
  private showStains(): void {
    if (this.flooded || this.visible) return;
    this.visible = true;
    this.revealProgress = 0;

    const W = this.container.clientWidth || window.innerWidth;
    const H = this.container.clientHeight || window.innerHeight;
    this.buildSVG(W, H);
    this.resumeReveal();
  }

  /** Stains vanish instantly — remove SVG, reset progress */
  private hideStains(): void {
    if (!this.visible) return;
    this.visible = false;
    clearInterval(this.revealTimer);

    // Quick fade out then remove
    if (this.svg) {
      const svg = this.svg;
      svg.style.transition = 'opacity 250ms ease-out';
      svg.style.opacity = '0';
      setTimeout(() => {
        if (svg.parentNode) svg.remove();
      }, 260);
      this.svg = null;
      this.funcA = null;
    }

    this.revealProgress = 0;
  }

  /** Resume (or start) the reveal interval from current progress. */
  private resumeReveal(): void {
    clearInterval(this.revealTimer);
    if (this.flooded || this.revealProgress >= 1) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      this.revealProgress = 0.6;
      this.updateThreshold();
      return;
    }

    const step = this.config.revealInterval / this.config.revealDuration;

    this.revealTimer = window.setInterval(() => {
      this.revealProgress = Math.min(1, this.revealProgress + step);
      this.updateThreshold();

      if (this.revealProgress >= 1) {
        clearInterval(this.revealTimer);
      }
    }, this.config.revealInterval);
  }

  private updateThreshold(): void {
    if (!this.funcA) return;
    this.funcA.setAttribute('tableValues', buildTableValues(this.revealProgress));
  }

  private buildSVG(w: number, h: number): void {
    this.removeSVG();

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.style.cssText = `position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:0;mix-blend-mode:multiply;transition:opacity 400ms ease-in;`;

    const defs = document.createElementNS(SVG_NS, 'defs');

    // Filter: noise → luminance → threshold → composite with edge gradient → blur
    const filter = document.createElementNS(SVG_NS, 'filter');
    filter.setAttribute('id', 'stain-reveal');
    filter.setAttribute('filterUnits', 'userSpaceOnUse');
    filter.setAttribute('x', '0');
    filter.setAttribute('y', '0');
    filter.setAttribute('width', String(w));
    filter.setAttribute('height', String(h));
    filter.setAttribute('color-interpolation-filters', 'sRGB');

    const turbulence = document.createElementNS(SVG_NS, 'feTurbulence');
    turbulence.setAttribute('type', 'fractalNoise');
    turbulence.setAttribute('baseFrequency', String(this.config.noiseFrequency));
    turbulence.setAttribute('numOctaves', String(this.config.noiseOctaves));
    turbulence.setAttribute('seed', String(this.noiseSeed));
    turbulence.setAttribute('stitchTiles', 'stitch');
    turbulence.setAttribute('result', 'noise');
    filter.appendChild(turbulence);

    const luma = document.createElementNS(SVG_NS, 'feColorMatrix');
    luma.setAttribute('in', 'noise');
    luma.setAttribute('type', 'luminanceToAlpha');
    luma.setAttribute('result', 'luma');
    filter.appendChild(luma);

    const transfer = document.createElementNS(SVG_NS, 'feComponentTransfer');
    transfer.setAttribute('in', 'luma');
    transfer.setAttribute('result', 'threshold');
    const funcA = document.createElementNS(SVG_NS, 'feFuncA');
    funcA.setAttribute('type', 'table');
    funcA.setAttribute('tableValues', buildTableValues(0));
    transfer.appendChild(funcA);
    filter.appendChild(transfer);
    this.funcA = funcA;

    const composite = document.createElementNS(SVG_NS, 'feComposite');
    composite.setAttribute('in', 'threshold');
    composite.setAttribute('in2', 'SourceGraphic');
    composite.setAttribute('operator', 'in');
    composite.setAttribute('result', 'masked');
    filter.appendChild(composite);

    const blur = document.createElementNS(SVG_NS, 'feGaussianBlur');
    blur.setAttribute('in', 'masked');
    blur.setAttribute('stdDeviation', '1.5');
    filter.appendChild(blur);

    defs.appendChild(filter);

    // Edge-weighted radial gradient
    const grad = document.createElementNS(SVG_NS, 'radialGradient');
    grad.setAttribute('id', 'edge-weight');
    grad.setAttribute('cx', '50%');
    grad.setAttribute('cy', '45%');
    grad.setAttribute('r', '65%');

    const stops = [
      { offset: '0%', opacity: '0' },
      { offset: '50%', opacity: '0.15' },
      { offset: '75%', opacity: '0.5' },
      { offset: '100%', opacity: '1' },
    ];
    stops.forEach((s) => {
      const stop = document.createElementNS(SVG_NS, 'stop');
      stop.setAttribute('offset', s.offset);
      stop.setAttribute('stop-color', this.config.stainColor);
      stop.setAttribute('stop-opacity', s.opacity);
      grad.appendChild(stop);
    });
    defs.appendChild(grad);

    svg.appendChild(defs);

    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('width', String(w));
    rect.setAttribute('height', String(h));
    rect.setAttribute('fill', 'url(#edge-weight)');
    rect.setAttribute('filter', 'url(#stain-reveal)');
    svg.appendChild(rect);

    this.container.appendChild(svg);
    this.svg = svg;

    // Fade in on next frame
    requestAnimationFrame(() => {
      if (this.svg) this.svg.style.opacity = String(this.config.groupOpacity);
    });
  }

  private flood(): void {
    if (this.flooded) return;
    this.flooded = true;
    clearInterval(this.revealTimer);

    const dur = this.config.floodDuration;

    // Dark overlay div — clean transition to depths
    const overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed;inset:0;z-index:9999;background:#0a0806;opacity:0;transition:opacity ${dur}ms ease-in;pointer-events:all;`;
    document.body.appendChild(overlay);

    const surface = document.querySelector('.surface') as HTMLElement | null;
    if (surface) {
      surface.style.transition = `opacity ${dur}ms ease-out`;
      surface.style.opacity = '0';
    }

    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
    });

    setTimeout(() => this.onFlood?.(), dur);
  }

  private handleResize(): void {
    if (this.flooded || !this.visible) return;
    const W = this.container.clientWidth || window.innerWidth;
    const H = this.container.clientHeight || window.innerHeight;
    const savedProgress = this.revealProgress;
    this.buildSVG(W, H);
    this.revealProgress = savedProgress;
    this.updateThreshold();
  }

  private removeSVG(): void {
    if (this.svg) {
      this.svg.remove();
      this.svg = null;
    }
    this.funcA = null;
  }
}
