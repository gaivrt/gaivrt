import { onMount, onCleanup, createSignal } from 'solid-js';
import { ParticleText } from '../../lib/particles/ParticleText';
import { PerformanceMonitor } from '../../lib/webgl/performanceMonitor';
import { getVisitCount } from '../../lib/visitStore';
import { ENTRANCE, TIMING } from '../../lib/constants';

export default function ParticleEntrance() {
  let canvasRef!: HTMLCanvasElement;
  const [showHint, setShowHint] = createSignal(false);
  const [exiting, setExiting] = createSignal(false);

  function navigateToSurface() {
    window.location.replace('/surface/');
  }

  onMount(() => {
    const visits = getVisitCount();
    if (visits > ENTRANCE.SKIP_THRESHOLD) {
      navigateToSurface();
      return;
    }

    let engine: ParticleText | null = null;
    try {
      engine = new ParticleText(canvasRef);
    } catch {
      navigateToSurface();
      return;
    }

    const monitor = new PerformanceMonitor({
      onLowFps: () => {
        // Could rebuild with larger gap, but for entrance just accept it
      },
      onCriticalFps: () => {
        engine?.dispose();
        engine = null;
        navigateToSurface();
      },
    });

    engine.onFrame = (time) => monitor.tick(time);
    engine.start();

    // Show hint after animation settles
    const hintDelay = visits <= 1 ? TIMING.ENTRANCE_FULL : TIMING.ENTRANCE_SHORT;
    const hintTimer = setTimeout(() => setShowHint(true), hintDelay);

    const handleExit = () => {
      if (exiting()) return;
      setExiting(true);
      setTimeout(navigateToSurface, 350);
    };

    const onClick = () => handleExit();
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

    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseleave', onMouseLeave);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('visibilitychange', onVisChange);
    window.addEventListener('resize', onResize);

    onCleanup(() => {
      clearTimeout(hintTimer);
      document.removeEventListener('click', onClick);
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
    <div
      class="entrance-container"
      style={{
        opacity: exiting() ? '0' : '1',
        transition: 'opacity 0.35s ease-out',
      }}
    >
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
