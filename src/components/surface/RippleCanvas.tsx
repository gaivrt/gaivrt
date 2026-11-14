import { onMount, onCleanup, createSignal } from 'solid-js';
import { RippleEffect } from '../../lib/webgl/RippleEffect';
import { PerformanceMonitor } from '../../lib/webgl/performanceMonitor';

export default function RippleCanvas() {
  let canvasRef!: HTMLCanvasElement;
  const [fallback, setFallback] = createSignal(false);
  const [mousePos, setMousePos] = createSignal({ x: -9999, y: -9999 });

  onMount(() => {
    let effect: RippleEffect | null = null;

    try {
      effect = new RippleEffect(canvasRef);
    } catch {
      setFallback(true);
      return;
    }

    const monitor = new PerformanceMonitor({
      onLowFps: () => effect?.setResolutionScale(0.5),
      onCriticalFps: () => {
        effect?.dispose();
        effect = null;
        setFallback(true);
      },
    });

    effect.onFrame = (time) => monitor.tick(time);

    // Trail takes the theme's accent colour
    const root = document.documentElement;
    const syncTint = () =>
      effect?.setTint(getComputedStyle(root).getPropertyValue('--surface-accent').trim());
    syncTint();
    const themeObserver = new MutationObserver(syncTint);
    themeObserver.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    effect.start();

    const onMouseMove = (e: MouseEvent) => {
      effect?.onMouseMove(e.clientX, e.clientY);
      setMousePos({ x: e.clientX, y: e.clientY });
    };

    const onVisChange = () => {
      if (document.hidden) {
        effect?.stop();
      } else {
        monitor.reset();
        effect?.start();
      }
    };

    const onResize = () => {
      effect?.resize(window.innerWidth, window.innerHeight);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('visibilitychange', onVisChange);
    window.addEventListener('resize', onResize);

    onCleanup(() => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('visibilitychange', onVisChange);
      window.removeEventListener('resize', onResize);
      themeObserver.disconnect();
      effect?.dispose();
    });
  });

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          display: fallback() ? 'none' : 'block',
          width: '100%',
          height: '100%',
        }}
      />
      {fallback() && (
        <div
          class="ripple-fallback"
          style={{
            position: 'fixed',
            inset: '0',
            'pointer-events': 'none',
            background: `radial-gradient(circle 60px at ${mousePos().x}px ${mousePos().y}px, color-mix(in srgb, var(--surface-accent) 25%, transparent), transparent)`,
          }}
        />
      )}
    </>
  );
}
