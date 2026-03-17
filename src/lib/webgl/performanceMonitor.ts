export class PerformanceMonitor {
  private frameTimes: number[] = [];
  private lastTime = 0;
  private windowSize = 60;
  private onLowFps?: () => void;
  private onCriticalFps?: () => void;
  private lowTriggered = false;
  private criticalTriggered = false;

  constructor(opts: { onLowFps?: () => void; onCriticalFps?: () => void }) {
    this.onLowFps = opts.onLowFps;
    this.onCriticalFps = opts.onCriticalFps;
  }

  tick(now: number) {
    if (this.lastTime > 0) {
      const delta = now - this.lastTime;
      this.frameTimes.push(delta);
      if (this.frameTimes.length > this.windowSize) {
        this.frameTimes.shift();
      }
    }
    this.lastTime = now;

    if (this.frameTimes.length < this.windowSize) return;

    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    const fps = 1000 / avg;

    if (fps < 15 && !this.criticalTriggered) {
      this.criticalTriggered = true;
      this.onCriticalFps?.();
    } else if (fps < 30 && !this.lowTriggered) {
      this.lowTriggered = true;
      this.onLowFps?.();
    }
  }

  reset() {
    this.frameTimes = [];
    this.lastTime = 0;
    this.lowTriggered = false;
    this.criticalTriggered = false;
  }
}
