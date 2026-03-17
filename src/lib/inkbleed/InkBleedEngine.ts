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

const INTERACTION_EVENTS = ['mousemove', 'keydown', 'scroll', 'touchstart', 'click', 'mousedown'] as const;

export class InkBleedEngine {
  private container: HTMLElement;
  private config: InkBleedConfig;
  private svg: SVGSVGElement | null = null;
  private funcA: SVGFEFuncAElement | null = null;
  private delayTimer = 0;
  private revealTimer = 0;
  private revealProgress = 0;
  private started = false;
  private spawned = false;
  private flooded = false;
  private resizeTimer = 0;
  private interactionHandler: (() => void) | null = null;
  private clickHandler: ((e: Event) => void) | null = null;
  private resizeHandler: (() => void) | null = null;
  private focusHandler: (() => void) | null = null;
  private blurHandler: (() => void) | null = null;

  onFlood?: () => void;

  constructor(container: HTMLElement, config?: Partial<InkBleedConfig>) {
    this.container = container;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  start(): void {
    if (this.started) return;
    this.started = true;

    // Interaction resets the delay timer (before reveal starts)
    this.interactionHandler = () => {
      if (!this.spawned && !this.flooded) this.resetDelayTimer();
    };
    for (const evt of INTERACTION_EVENTS) {
      document.addEventListener(evt, this.interactionHandler);
    }

    // Focus/blur: pause when unfocused, resume when focused
    this.blurHandler = () => {
      clearTimeout(this.delayTimer);
      clearInterval(this.revealTimer);
    };
    this.focusHandler = () => {
      if (!document.hasFocus()) return;
      if (this.spawned && !this.flooded && this.revealProgress < 1) {
        this.resumeReveal();
      } else if (!this.spawned && !this.flooded) {
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

    // Only proceed if page is focused
    if (!document.hasFocus()) return;

    if (!this.spawned) {
      this.resetDelayTimer();
    } else if (!this.flooded && this.revealProgress < 1) {
      this.resumeReveal();
    }
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    clearTimeout(this.delayTimer);
    clearTimeout(this.resizeTimer);
    clearInterval(this.revealTimer);

    if (this.interactionHandler) {
      for (const evt of INTERACTION_EVENTS) {
        document.removeEventListener(evt, this.interactionHandler);
      }
    }
    if (this.focusHandler) window.removeEventListener('focus', this.focusHandler);
    if (this.blurHandler) window.removeEventListener('blur', this.blurHandler);
    if (this.resizeHandler) window.removeEventListener('resize', this.resizeHandler);
  }

  dispose(): void {
    this.stop();
    this.removeSVG();
    this.spawned = false;
    this.flooded = false;
    this.revealProgress = 0;
  }

  private resetDelayTimer(): void {
    clearTimeout(this.delayTimer);
    this.delayTimer = window.setTimeout(() => this.startReveal(), this.config.appearDelay);
  }

  private startReveal(): void {
    if (this.flooded || this.spawned) return;
    this.spawned = true;

    const W = this.container.clientWidth || window.innerWidth;
    const H = this.container.clientHeight || window.innerHeight;
    this.buildSVG(W, H);
    this.resumeReveal();
  }

  /** Resume (or start) the reveal interval from current progress. */
  private resumeReveal(): void {
    clearInterval(this.revealTimer);
    if (this.flooded || this.revealProgress >= 1) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      this.revealProgress = 0.6;
      this.updateThreshold();
      this.enableInteraction();
      return;
    }

    const step = this.config.revealInterval / this.config.revealDuration;

    this.revealTimer = window.setInterval(() => {
      this.revealProgress = Math.min(1, this.revealProgress + step);
      this.updateThreshold();

      if (this.revealProgress >= 0.3 && !this.clickHandler) {
        this.enableInteraction();
      }
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
    svg.style.cssText = `position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:${this.config.groupOpacity};`;

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
    turbulence.setAttribute('seed', String(Math.floor(Math.random() * 999)));
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
    funcA.setAttribute('tableValues', buildTableValues(this.revealProgress));
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
  }

  private enableInteraction(): void {
    if (!this.svg || this.flooded || this.clickHandler) return;

    this.svg.style.pointerEvents = 'auto';
    this.svg.style.cursor = 'pointer';

    this.clickHandler = (e: Event) => {
      if (this.flooded) return;
      e.preventDefault();
      e.stopPropagation();
      this.flood();
    };
    this.svg.addEventListener('click', this.clickHandler);
    this.svg.addEventListener('touchend', this.clickHandler);
  }

  private flood(): void {
    if (this.flooded || !this.funcA) return;
    this.flooded = true;
    clearInterval(this.revealTimer);

    const steps = 10;
    let step = 0;
    const interval = window.setInterval(() => {
      step++;
      const t = step / steps;
      const progress = t * t;
      const blended = this.revealProgress + (1 - this.revealProgress) * progress;
      this.funcA!.setAttribute('tableValues', buildTableValues(blended));

      if (step >= steps) {
        clearInterval(interval);
        this.funcA!.setAttribute('tableValues', '1 1 1 1 1 1 1 1 1 1');
      }
    }, this.config.floodDuration / steps);

    const surface = document.querySelector('.surface') as HTMLElement | null;
    if (surface) {
      surface.style.transition = `opacity ${this.config.floodDuration}ms ease-out`;
      surface.style.opacity = '0';
    }

    if (this.svg) {
      this.svg.style.transition = `opacity ${this.config.floodDuration}ms ease-in`;
      this.svg.style.opacity = '1';
    }

    setTimeout(() => this.onFlood?.(), this.config.floodDuration);
  }

  private handleResize(): void {
    if (this.flooded || !this.spawned) return;
    const W = this.container.clientWidth || window.innerWidth;
    const H = this.container.clientHeight || window.innerHeight;
    const savedProgress = this.revealProgress;
    this.buildSVG(W, H);
    this.revealProgress = savedProgress;
    this.updateThreshold();
    if (this.revealProgress >= 0.3) this.enableInteraction();
  }

  private removeSVG(): void {
    if (this.clickHandler && this.svg) {
      this.svg.removeEventListener('click', this.clickHandler);
      this.svg.removeEventListener('touchend', this.clickHandler);
      this.clickHandler = null;
    }
    if (this.svg) {
      this.svg.remove();
      this.svg = null;
    }
    this.funcA = null;
  }
}
