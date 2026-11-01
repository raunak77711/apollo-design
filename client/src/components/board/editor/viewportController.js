import { WORLD_W } from '../engine/theme.js';
import { clampView, fitZoom, focusRect, panBy, viewForSection, zoomAbout } from '../engine/viewportMath.js';

/**
 * The camera. Wheel pans, Ctrl/Cmd+wheel (and a trackpad pinch, which browsers
 * report as ctrl+wheel) zooms about the cursor, Shift+wheel pans sideways.
 * A mouse-wheel notch eases into place over a few frames; a trackpad glide is
 * applied as it arrives, because it is already smooth.
 *
 * The board is not a scrolled element, so there is no browser scroll height and
 * no canvas-size ceiling: the Fabric canvas is only ever as big as the window.
 */
export function createViewportController({ canvas, container, getWorld, onChange }) {
  let view = { zoom: 1, x: 0, y: 0 };
  let target = null;
  let raf = 0;
  let drag = null;

  const size = () => ({ viewW: container.clientWidth, viewH: container.clientHeight });
  const limits = () => ({ ...size(), worldW: WORLD_W, worldH: getWorld().height });

  function apply(next, { notify = true } = {}) {
    view = clampView(next, limits());
    canvas.setViewportTransform([view.zoom, 0, 0, view.zoom, view.x, view.y]);
    canvas.requestRenderAll();
    if (notify) onChange?.(view);
  }

  const stopEase = () => {
    cancelAnimationFrame(raf);
    raf = 0;
    target = null;
  };

  function ease() {
    if (!target) return;
    const dx = target.x - view.x;
    const dy = target.y - view.y;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
      apply(target);
      stopEase();
      return;
    }
    apply({ zoom: view.zoom, x: view.x + dx * 0.28, y: view.y + dy * 0.28 });
    raf = requestAnimationFrame(ease);
  }

  function easeBy(dx, dy) {
    target = clampView(panBy(target || view, dx, dy), limits());
    if (!raf) raf = requestAnimationFrame(ease);
  }

  const lineHeight = (e, v) => (e.deltaMode === 1 ? v * 32 : e.deltaMode === 2 ? v * container.clientHeight : v);

  function onWheel(e) {
    e.preventDefault();
    const rect = container.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) {
      stopEase();
      const factor = Math.exp(-lineHeight(e, e.deltaY) * 0.002);
      apply(zoomAbout(view, factor, e.clientX - rect.left, e.clientY - rect.top));
      return;
    }
    const dx = lineHeight(e, e.deltaX);
    const dy = lineHeight(e, e.deltaY);
    const sideways = e.shiftKey && dx === 0;
    const px = sideways ? dy : dx;
    const py = sideways ? 0 : dy;
    const notch = e.deltaMode === 0 && dx === 0 && Number.isInteger(dy) && Math.abs(dy) >= 50 && !sideways;
    if (notch) easeBy(-px, -py);
    else {
      stopEase();
      apply(panBy(view, -px, -py));
    }
  }

  container.addEventListener('wheel', onWheel, { passive: false });

  const centre = () => {
    const { viewW, viewH } = size();
    return { sx: viewW / 2, sy: viewH / 2 };
  };

  return {
    get view() {
      return view;
    },
    set(next, opts) {
      stopEase();
      apply(next, opts);
    },
    zoomBy(factor, sx, sy) {
      stopEase();
      const c = centre();
      apply(zoomAbout(view, factor, sx ?? c.sx, sy ?? c.sy));
    },
    /** Fit the board's width to the window, keeping whatever is at the centre in view. */
    fit() {
      stopEase();
      const { viewW, viewH } = size();
      const worldY = (viewH / 2 - view.y) / view.zoom;
      const zoom = fitZoom(viewW);
      apply({ zoom, x: 0, y: viewH / 2 - worldY * zoom });
    },
    reset() {
      stopEase();
      const { viewW } = size();
      apply({ zoom: fitZoom(viewW), x: 0, y: 0 });
    },
    focusRect(rect) {
      stopEase();
      apply(focusRect(rect, size()));
    },
    goToSection(section) {
      stopEase();
      apply(viewForSection(section, view));
    },
    panBy(dx, dy) {
      stopEase();
      apply(panBy(view, dx, dy));
    },
    beginDrag(clientX, clientY) {
      stopEase();
      drag = { x: clientX, y: clientY };
    },
    moveDrag(clientX, clientY) {
      if (!drag) return;
      apply(panBy(view, clientX - drag.x, clientY - drag.y));
      drag = { x: clientX, y: clientY };
    },
    endDrag() {
      drag = null;
    },
    isDragging: () => drag !== null,
    resize() {
      const { viewW, viewH } = size();
      canvas.setDimensions({ width: viewW, height: viewH });
      apply(view);
    },
    dispose() {
      stopEase();
      container.removeEventListener('wheel', onWheel);
    },
  };
}
