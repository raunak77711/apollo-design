/**
 * Cutting a vertical window out of a horizontal recording.
 *
 * Pure geometry, no React: the preview, the renderer and the tests all call these.
 *
 * The goal is NOT to follow the face. A talking-head short needs the person AND their hands, and on a
 * horizontal frame the hands live to the side and below the face. So the window is a wide crop (4:3 by
 * default: three quarters of the frame's width), placed so the face is comfortably inside it and leaning
 * toward the middle of the frame, where the hands move. Only a deliberate "punch in" gets tighter, and
 * even then it is limited (theme.CAMERA).
 *
 * Face positions are normalised {x, y, w, h} (0-1 of the source frame), found once per ten minutes by a
 * local detector (server/whisper/framing.py).
 */

/** The window shapes a person can choose (width / height). Wider keeps more of the hands in. */
export const ASPECTS = { '1:1': 1, '4:5': 0.8, '4:3': 4 / 3, '3:2': 1.5, '16:9': 16 / 9 };

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, t) => a + (b - a) * t;

/** The face to frame at a moment of the SOURCE recording: the nearest sample in time that found one. */
export function faceAt(framing, sourceTime) {
  const found = (framing?.keyframes || []).filter((k) => k.face);
  if (!found.length) return framing?.head || null;
  const near = found.reduce((best, k) => (Math.abs(k.t - sourceTime) < Math.abs(best.t - sourceTime) ? k : best));
  return near.face;
}

/**
 * The part of the source frame to show, in source pixels.
 *   aspect      width / height of the window (1.333 for 4:3)
 *   handsRoom   0-1: how far to lean from the face toward the middle of the frame
 *   zoom        1 = the whole height of the frame; 1.12 = a little tighter
 *   wide        0-1: ease the window toward the full frame (a "punch out" to show the hands)
 */
export function cropFor({ source, face, aspect, handsRoom = 0.35, zoom = 1, wide = 0 }) {
  const { width, height } = source;
  const frameAspect = width / height;
  const eff = lerp(aspect, frameAspect, clamp(wide, 0, 1));
  let baseH = height;
  let baseW = baseH * eff;
  if (baseW > width) {
    baseW = width;
    baseH = width / eff;
  }
  const vw = baseW / zoom;
  const vh = baseH / zoom;

  const fx = face ? (face.x + face.w / 2) * width : width / 2;
  const fy = face ? (face.y + face.h / 2) * height : height * 0.35;
  const tight = clamp((zoom - 1) * 4, 0, 1); // the more it zooms, the more it follows the face
  const cx = lerp(lerp(fx, width / 2, clamp(handsRoom, 0, 1)), fx, tight);
  const cy = lerp(height / 2, fy + vh * 0.12, tight);

  let x = cx - vw / 2;
  let y = cy - vh / 2;
  if (face) {
    // Whatever else happens, the face stays inside the window with a little air round it.
    const left = face.x * width;
    const right = (face.x + face.w) * width;
    const margin = vw * 0.06;
    if (x > left - margin) x = left - margin;
    if (x + vw < right + margin) x = right + margin - vw;
  }
  return { x: clamp(x, 0, width - vw), y: clamp(y, 0, height - vh), w: vw, h: vh };
}

/** CSS for a video that fills `rect` showing only `viewport` of the source. */
export function videoStyle(viewport, rect, source) {
  const k = rect.w / viewport.w;
  return { position: 'absolute', width: source.width * k, height: source.height * k, left: -viewport.x * k || 0, top: -viewport.y * k || 0, maxWidth: 'none' };
}

/** How the horizontal source maps onto the window, for the notes the page shows ("shows 75% of the width"). */
export function coverage(viewport, source) {
  return { width: viewport.w / source.width, height: viewport.h / source.height };
}
