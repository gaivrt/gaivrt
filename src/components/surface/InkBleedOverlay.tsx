import { onMount, onCleanup } from 'solid-js';
import { InkBleedEngine } from '../../lib/inkbleed/InkBleedEngine';
import { getVisitCount } from '../../lib/visitStore';
import { TIMING } from '../../lib/constants';

export default function InkBleedOverlay() {
  let containerRef!: HTMLDivElement;

  onMount(() => {
    const visits = getVisitCount();

    let delay = TIMING.INK_BLEED_DELAY;
    if (visits > 10) delay = TIMING.INK_BLEED_DELAY / 6;
    else if (visits > 5) delay = TIMING.INK_BLEED_DELAY / 3;

    const engine = new InkBleedEngine(containerRef, { appearDelay: delay });

    engine.onFlood = () => {
      window.location.href = '/depths/';
    };

    engine.start();

    const onVisChange = () => {
      if (document.hidden) engine.stop();
      else engine.start();
    };
    document.addEventListener('visibilitychange', onVisChange);

    const onSwap = () => engine.dispose();
    document.addEventListener('astro:before-swap', onSwap);

    onCleanup(() => {
      document.removeEventListener('visibilitychange', onVisChange);
      document.removeEventListener('astro:before-swap', onSwap);
      engine.dispose();
    });
  });

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: '0',
        overflow: 'hidden',
      }}
    />
  );
}
