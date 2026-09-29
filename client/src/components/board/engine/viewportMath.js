import { WORLD_W } from './theme.js';

/**
 * Pan/zoom as plain maths. A view is { zoom, x, y }: (x, y) is where world
 * (0, 0) sits on screen, in pixels, so screen = world * zoom + (x, y).
 * Keeping it pure means the camera behaves the same on a 13" laptop and in a
 * test, and the controller is only wiring.
 */

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;
export const MARGIN = 160;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const clampZoom = (z) => clamp(z, MIN_ZOOM, MAX_ZOOM);

export const fitZoom = (viewW, worldW = WORLD_W) => clampZoom(viewW / worldW);

export function clampView(view, { viewW, viewH, worldW = WORLD_W, worldH }) {
  const zoom = clampZoom(view.zoom);
  const w = worldW * zoom;
  const h = worldH * zoom;
  const x = w <= viewW ? (viewW - w) / 2 : clamp(view.x, viewW - w - MARGIN, MARGIN);
  const minY = viewH - h - MARGIN;
  const y = minY > MARGIN ? MARGIN : clamp(view.y, minY, MARGIN);
  return { zoom, x, y };
}

/** Zoom by `factor` keeping the world point under screen (sx, sy) where it is. */
export function zoomAbout(view, factor, sx, sy) {
  const zoom = clampZoom(view.zoom * factor);
  const k = zoom / view.zoom;
  return { zoom, x: sx - (sx - view.x) * k, y: sy - (sy - view.y) * k };
}

export const panBy = (view, dx, dy) => ({ zoom: view.zoom, x: view.x + dx, y: view.y + dy });

/** The view that centres a world rectangle, zoomed as far as fits (never past maxZoom). */
export function focusRect(rect, { viewW, viewH, pad = 120, maxZoom = 2.5 }) {
  const zoom = clamp(Math.min((viewW - pad * 2) / rect.w, (viewH - pad * 2) / rect.h), MIN_ZOOM, Math.min(maxZoom, MAX_ZOOM));
  return {
    zoom,
    x: viewW / 2 - (rect.x + rect.w / 2) * zoom,
    y: viewH / 2 - (rect.y + rect.h / 2) * zoom,
  };
}

export const worldYAtCenter = (view, viewH) => (viewH / 2 - view.y) / view.zoom;

/** Where a slim position indicator's thumb sits, as fractions (0–1) of its track. */
export function scrollThumb(view, viewH, worldH) {
  const total = worldH * view.zoom;
  const size = clamp(viewH / Math.max(total, 1), 0.04, 1);
  const range = Math.max(total - viewH, 1);
  const top = clamp((-view.y / range) * (1 - size), 0, 1 - size);
  return { top, size };
}

/** Scroll so a section's top sits just under the top of the window, keeping the current zoom. */
export function viewForSection(section, view) {
  return { zoom: view.zoom, x: view.x, y: -section.y * view.zoom + 24 };
}
