import { onMount, onCleanup } from 'solid-js';
import { InkBleedEngine } from '../../lib/inkbleed/InkBleedEngine';
import { getVisitCount } from '../../lib/visitStore';
import { TIMING } from '../../lib/constants';

function isDarkMode(): boolean {
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

function buildEngine(container: HTMLElement): InkBleedEngine {
  const visits = getVisitCount();
  const dark = isDarkMode();

  let delay = TIMING.INK_BLEED_DELAY;
  if (visits > 10) delay = TIMING.INK_BLEED_DELAY / 2;
  else if (visits > 5) delay = TIMING.INK_BLEED_DELAY * 0.6;

  return new InkBleedEngine(container, {
    appearDelay: delay,
    ...(dark && {
      stainColor: '#d4c4a8',
      blendMode: 'screen',
      groupOpacity: 0.5,
    }),
  });
}

export default function InkBleedOverlay() {
  let containerRef!: HTMLDivElement;

  onMount(() => {
    let engine = buildEngine(containerRef);
    let wasDark = isDarkMode();

    engine.onFlood = () => { window.location.href = '/depths/'; };
    engine.start();

    // Rebuild engine when theme changes so stain color/blend match the new theme
    const observer = new MutationObserver(() => {
      const nowDark = isDarkMode();
      if (nowDark === wasDark) return;
      wasDark = nowDark;
      engine.dispose();
      engine = buildEngine(containerRef);
      engine.onFlood = () => { window.location.href = '/depths/'; };
      engine.start();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    const onVisChange = () => {
      if (document.hidden) engine.stop();
      else engine.start();
    };
    document.addEventListener('visibilitychange', onVisChange);

    const onSwap = () => engine.dispose();
    document.addEventListener('astro:before-swap', onSwap);

    onCleanup(() => {
      observer.disconnect();
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
