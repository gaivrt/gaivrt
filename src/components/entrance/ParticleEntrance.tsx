import { onMount, onCleanup, createSignal } from 'solid-js';
import { ParticleText } from '../../lib/particles/ParticleText';
import { PerformanceMonitor } from '../../lib/webgl/performanceMonitor';
import { getVisitCount } from '../../lib/visitStore';
import { TIMING } from '../../lib/constants';

export default function ParticleEntrance() {
  let canvasRef!: HTMLCanvasElement;
  const [showHint, setShowHint] = createSignal(false);
  let exiting = false;

  /** Whether to show at all is decided before first paint, in Entrance.astro. */
  const root = document.documentElement;
  const finish = () => { delete root.dataset.entrance; };

  onMount(() => {
    if (root.dataset.entrance !== 'show') return;
    const visits = getVisitCount();

    let engine: ParticleText | null = null;
    try {
      engine = new ParticleText(canvasRef);
      engine.darkMode = document.documentElement.getAttribute('data-theme') === 'dark';
    } catch {
      finish();
      return;
    }

    const monitor = new PerformanceMonitor({
      onLowFps: () => {
        // Could rebuild with larger gap, but for entrance just accept it
      },
      onCriticalFps: () => {
        engine?.dispose();
        engine = null;
        finish();
      },
    });

    engine.onFrame = (time) => monitor.tick(time);
    engine.start();

    // Show hint after animation settles
    const hintDelay = visits <= 1 ? TIMING.ENTRANCE_FULL : TIMING.ENTRANCE_SHORT;
    const hintTimer = setTimeout(() => setShowHint(true), hintDelay);

    const handleExit = () => {
      if (exiting) return;
      exiting = true;
      root.dataset.entrance = 'leaving';   // fades the overlay out (Entrance.astro)
      setTimeout(() => { finish(); engine?.dispose(); engine = null; }, 350);
    };

    // The click belongs to the entrance alone: nothing on the page beneath should hear it
    const onClick = (e: MouseEvent) => { e.stopPropagation(); handleExit(); };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab' || e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;
      handleExit();
    };

    const onMouseMove = (e: MouseEvent) => engine?.onMouseMove(e.clientX, e.clientY);
    const onMouseLeave = () => engine?.onMouseLeave();
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      engine?.onMouseMove(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onTouchEnd = () => engine?.onMouseLeave();

    const onVisChange = () => {
      if (document.hidden) {
        engine?.stop();
      } else {
        monitor.reset();
        engine?.start();
      }
    };

    const onResize = () => engine?.resize();

    window.addEventListener('click', onClick, { capture: true, once: true });
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseleave', onMouseLeave);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('visibilitychange', onVisChange);
    window.addEventListener('resize', onResize);

    onCleanup(() => {
      clearTimeout(hintTimer);
      window.removeEventListener('click', onClick, { capture: true });
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseleave', onMouseLeave);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('visibilitychange', onVisChange);
      window.removeEventListener('resize', onResize);
      engine?.dispose();
    });
  });

  return (
    <div class="entrance-container">
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          cursor: 'default',
        }}
      />
      <div
        class="entrance-hint"
        style={{
          opacity: showHint() ? '1' : '0',
          transition: 'opacity 0.8s ease-in',
        }}
      >
        click anywhere to enter
      </div>
    </div>
  );
}
