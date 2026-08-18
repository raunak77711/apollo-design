import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../../lib/theme.jsx';
import { useMediaQuery } from '../../lib/useMediaQuery.js';

/**
 * The sky the homepage is set in.
 *
 * The same 3D moon the user watches while Apollo draws — the project's own
 * model, its real displaced mesh and its real crater map — held in a composed
 * framing instead of drifting. Putting it here rather than only on the
 * generation screen means the place you brief Apollo in is the place it works
 * in, and the assets are already decoded by the time a generation starts.
 *
 * The moon answers three things about the page: where the pointer is, whether
 * the composer has focus, and how far it has been scrolled past. None of that
 * is load-bearing — every layer degrades on its own, down to a CSS still, and
 * the hero's type and prompt box never depend on any of it.
 */

const RISE_MS = 1400;

export default function MoonStage({ focus = 0 }) {
  const { theme } = useTheme();
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const rootRef = useRef(null);
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const focusRef = useRef(focus);
  const [fallback, setFallback] = useState(() => !worthRendering());

  /* -------------------------------- the moon ------------------------------ */

  useEffect(() => {
    if (fallback) return undefined;
    let cancelled = false;
    let raf = 0;

    // The renderer, the mesh and 235 KB of texture are the heaviest thing on
    // the homepage and none of it is needed to read or use the page, so it is
    // fetched once the browser has a moment rather than racing first paint.
    const idle = whenIdle(() => {
      import('../generation/moonScene.js')
        .then(async ({ createMoonScene, loadMoonAssets }) => {
          const assets = await loadMoonAssets();
          if (cancelled || !canvasRef.current) return;

          const scene = createMoonScene(canvasRef.current, assets, {
            theme,
            reducedMotion,
            framing: 'hero',
            onLost: () => setFallback(true),
          });
          if (!scene) {
            setFallback(true);
            return;
          }
          sceneRef.current = scene;

          // Whatever the page already knew before the moon arrived.
          scene.setFocus(focusRef.current);
          if (rootRef.current) scene.setSetting(scrolledPast(rootRef.current));

          // The moon rises into the page rather than appearing in it.
          const start = performance.now();
          const rise = (now) => {
            const t = Math.min(1, (now - start) / (reducedMotion ? 260 : RISE_MS));
            scene.setFade(t * t * (3 - 2 * t));
            if (t < 1) raf = requestAnimationFrame(rise);
          };
          raf = requestAnimationFrame(rise);
        })
        .catch(() => {
          if (!cancelled) setFallback(true);
        });
    });

    return () => {
      cancelled = true;
      cancelIdle(idle);
      cancelAnimationFrame(raf);
      sceneRef.current?.destroy();
      sceneRef.current = null;
    };
    // The scene is built once and then told about changes; rebuilding it on a
    // theme toggle would drop the GL context and restart the entrance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion, fallback]);

  useEffect(() => {
    sceneRef.current?.setTheme(theme);
  }, [theme]);

  useEffect(() => {
    focusRef.current = focus;
    sceneRef.current?.setFocus(focus);
  }, [focus]);

  /* ------------------------------ the page ------------------------------- */

  useEffect(() => {
    const root = rootRef.current;
    // Reduced motion gets a still composition, so there is nothing here for
    // the pointer or the scroll to move.
    if (fallback || reducedMotion || !root) return undefined;

    let onScreen = true;

    const onPointerMove = (event) => {
      if (!onScreen) return;
      const x = (event.clientX / window.innerWidth) * 2 - 1;
      const y = (event.clientY / window.innerHeight) * 2 - 1;
      // Against the pointer, not with it. The moon is the far object in the
      // frame, so panning the view slides it the other way — and it keeps the
      // moon clear of the type, which is where the cursor spends its time.
      sceneRef.current?.setPointer(-x, -y);
    };

    const onScroll = () => sceneRef.current?.setSetting(scrolledPast(root));

    // Nothing to draw once the hero is gone, so nothing is drawn.
    const observer = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        sceneRef.current?.setActive(onScreen);
      },
      { threshold: 0 }
    );
    observer.observe(root);

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('scroll', onScroll);
    };
  }, [fallback, reducedMotion]);

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {fallback ? <StillSky /> : <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />}

      {/* The sky has to stop somewhere, and a hard edge would read as a banner
          pasted onto the page. It dissolves into the page's own background
          instead, so the hero ends at a horizon rather than at a border. */}
      <div
        className="absolute inset-x-0 bottom-0 h-32 sm:h-44"
        style={{ background: 'linear-gradient(to bottom, transparent, rgb(var(--c-void)))' }}
      />
    </div>
  );
}

/* -------------------------------- fallback -------------------------------- */

/**
 * The same sky, composed in CSS. Not a spinner and not an apology — the moon is
 * roughly where the render would have put it, so the layout still works.
 */
function StillSky() {
  return (
    <div
      className="absolute inset-0"
      style={{ background: 'linear-gradient(to bottom, var(--sky-top), var(--sky-bottom))' }}
    >
      <div
        className="absolute left-[54%] top-[28%] aspect-square w-[min(74vw,24rem)] -translate-x-1/2 -translate-y-1/2 rounded-full lg:left-[70%] lg:top-[42%] lg:w-[min(58vh,34rem)]"
        style={{ background: 'var(--sky-moon)', boxShadow: 'var(--sky-halo)' }}
      />
    </div>
  );
}

/* --------------------------------- helpers -------------------------------- */

/** Whether it is worth asking for the render at all. */
function worthRendering() {
  if (typeof window === 'undefined') return false;
  // An explicit data-saving preference is a request not to fetch a quarter of a
  // megabyte of moon. WebGL support itself is discovered by trying.
  return !navigator.connection?.saveData;
}

/** How far an element has been scrolled past, 0..1 of its own height. */
function scrolledPast(element) {
  const rect = element.getBoundingClientRect();
  if (rect.height <= 0) return 0;
  return Math.min(1, Math.max(0, -rect.top / rect.height));
}

function whenIdle(fn) {
  if (typeof requestIdleCallback === 'function') return requestIdleCallback(fn, { timeout: 500 });
  return setTimeout(fn, 140);
}

function cancelIdle(handle) {
  if (typeof cancelIdleCallback === 'function') cancelIdleCallback(handle);
  else clearTimeout(handle);
}
