import { useEffect, useRef, useState } from 'react';
import { cx } from '../../lib/cx.js';
import { useTheme } from '../../lib/theme.jsx';
import { useMediaQuery } from '../../lib/useMediaQuery.js';
import { Wordmark } from '../../ui/brand.jsx';
import { STAGE_ORDER, stageDetail, stageLabel } from './stages.js';

/**
 * Apollo is creating your design under the moon.
 *
 * The full-screen scene shown while a design is generated. The moon itself is a
 * real 3D render of the project's model (see `moonScene.js`), lazy-loaded on
 * mount so nothing about it is paid for until a generation actually starts —
 * the module, the mesh and the textures are all fetched here and nowhere else.
 *
 * Everything degrades rather than breaks. No WebGL, a lost context, a failed
 * asset fetch, or reduced motion each fall back a step, and the status line —
 * the part that is actually load-bearing — is plain DOM that never depends on
 * any of it.
 */
export default function GenerationScene({ stage, open = true, onExited }) {
  const { theme } = useTheme();
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const [fallback, setFallback] = useState(false);

  const done = stage === 'done';

  /* ------------------------------- the moon ------------------------------ */

  useEffect(() => {
    let cancelled = false;
    let raf = 0;

    // The renderer, the mesh and 235 KB of texture arrive together, and only
    // once a generation is genuinely under way.
    import('./moonScene.js')
      .then(async ({ createMoonScene, loadMoonAssets }) => {
        const assets = await loadMoonAssets();
        if (cancelled || !canvasRef.current) return;

        const scene = createMoonScene(canvasRef.current, assets, {
          theme,
          reducedMotion,
          onLost: () => setFallback(true),
        });
        if (!scene) {
          setFallback(true);
          return;
        }
        sceneRef.current = scene;

        // The moon rises rather than appears: the scene fades up over its own
        // first second, in step with the panel's entrance.
        const start = performance.now();
        const rise = (now) => {
          const t = Math.min(1, (now - start) / (reducedMotion ? 240 : 1100));
          scene.setFade(t * t * (3 - 2 * t));
          if (t < 1) raf = requestAnimationFrame(rise);
        };
        raf = requestAnimationFrame(rise);
      })
      .catch(() => {
        if (!cancelled) setFallback(true);
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      // Buffers, textures, programs and the context itself, released the
      // moment the design is on screen.
      sceneRef.current?.destroy();
      sceneRef.current = null;
    };
    // The scene is built once and told about theme changes; rebuilding it on a
    // theme toggle would drop the context and restart the animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  useEffect(() => {
    sceneRef.current?.setTheme(theme);
  }, [theme]);

  /* -------------------------------- exiting ------------------------------ */

  // The design is already on the canvas underneath; this is the moment it is
  // handed over. The scene dims as the overlay clears rather than cutting.
  useEffect(() => {
    if (open) return undefined;
    let raf = 0;
    const start = performance.now();
    const settle = (now) => {
      const t = Math.min(1, (now - start) / 420);
      sceneRef.current?.setFade(1 - t);
      if (t < 1) raf = requestAnimationFrame(settle);
    };
    raf = requestAnimationFrame(settle);
    const timer = setTimeout(() => onExited?.(), 460);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [open, onExited]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`${stageLabel(stage)}. ${stageDetail(stage)}`}
      className={cx(
        'fixed inset-0 z-[75] flex flex-col items-center justify-center overflow-hidden',
        'transition-opacity duration-[420ms] ease-out',
        open ? 'opacity-100' : 'pointer-events-none opacity-0'
      )}
    >
      {/* The rendered sky, or a designed still if the GPU cannot oblige. */}
      {fallback ? (
        <StaticSky theme={theme} />
      ) : (
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
      )}

      {/* A dark scrim under the type only, so the status stays legible against
          a bright daytime sky without dimming the scene itself. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[46%]"
        style={{
          background:
            theme === 'light'
              ? 'linear-gradient(to top, rgb(255 255 255 / 0.92), rgb(255 255 255 / 0.5) 45%, transparent)'
              : 'linear-gradient(to top, rgb(4 5 10 / 0.88), rgb(4 5 10 / 0.42) 45%, transparent)',
        }}
      />

      <div className="absolute left-1/2 top-7 -translate-x-1/2 animate-fade-in opacity-70">
        <Wordmark markSize={18} className={theme === 'light' ? '!text-[#1B2430]' : '!text-white'} />
      </div>

      <Status stage={stage} done={done} theme={theme} />
    </div>
  );
}

/* --------------------------------- status --------------------------------- */

/**
 * The line that tells the user what is happening.
 *
 * Sits low in the frame, out of the moon's way. Each message cross-fades in
 * place — keyed on the stage, so React replaces the node and the entrance
 * animation replays — and the ticks beneath it show how far through the
 * pipeline Apollo is without pretending to know a percentage.
 */
function Status({ stage, done, theme }) {
  const light = theme === 'light';
  const index = STAGE_ORDER.indexOf(stage);

  return (
    <div className="absolute inset-x-0 bottom-[13%] flex flex-col items-center px-6 text-center">
      <div key={stage} className="animate-rise">
        <p
          className={cx(
            'font-display text-[19px] font-medium tracking-[-0.02em] sm:text-[22px]',
            light ? 'text-[#141A22]' : 'text-white'
          )}
        >
          {stageLabel(stage)}
          {!done && <span className="inline-block animate-pulse">…</span>}
        </p>
        <p className={cx('mt-1.5 text-[13px] leading-relaxed', light ? 'text-[#41505F]' : 'text-white/55')}>
          {stageDetail(stage)}
        </p>
      </div>

      <div className="mt-6 flex items-center gap-1.5" aria-hidden="true">
        {STAGE_ORDER.filter((s) => s !== 'reconsidering' && s !== 'done').map((s, i) => {
          const reached = index >= STAGE_ORDER.indexOf(s) || done;
          return (
            <span
              key={s}
              className={cx(
                'h-[3px] rounded-full transition-all duration-500 ease-out',
                reached ? 'w-7' : 'w-3',
                reached
                  ? light
                    ? 'bg-[#141A22]/60'
                    : 'bg-white/70'
                  : light
                    ? 'bg-[#141A22]/15'
                    : 'bg-white/15'
              )}
              style={{ transitionDelay: `${i * 40}ms` }}
            />
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------- fallback -------------------------------- */

/**
 * The same scene, composed in CSS, for anything that cannot run the renderer.
 * Not a spinner and not an apology — a still of the same sky, so the moment
 * still reads as Apollo working rather than as something having gone wrong.
 */
function StaticSky({ theme }) {
  const light = theme === 'light';

  return (
    <div
      className="absolute inset-0"
      aria-hidden="true"
      style={{
        background: light
          ? 'radial-gradient(120% 90% at 50% 0%, #BBD7F2 0%, #DCE9F6 45%, #F6F1E8 100%)'
          : 'radial-gradient(120% 90% at 50% 18%, #141B2E 0%, #080B16 48%, #030409 100%)',
      }}
    >
      <div
        className="absolute left-1/2 top-[38%] h-[min(38vh,17rem)] w-[min(38vh,17rem)] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background: light
            ? 'radial-gradient(circle at 38% 32%, #FFFFFF 0%, #F2EFE8 52%, #D8D2C6 82%, #C4BCAE 100%)'
            : 'radial-gradient(circle at 34% 30%, #FBF8F1 0%, #DCD6C9 40%, #8C8878 74%, #35333c 100%)',
          boxShadow: light
            ? '0 0 90px 30px rgb(255 255 255 / 0.45)'
            : '0 0 120px 40px rgb(150 172 226 / 0.22), 0 0 300px 90px rgb(90 110 180 / 0.14)',
        }}
      />
    </div>
  );
}
