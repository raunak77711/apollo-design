import { ASPECTS, cropFor, faceAt } from './framing.js';
import { CAMERA, LAYOUT, MOTION } from './theme.js';

/**
 * What the screen is doing at a given moment: the maths between a Director Track and a picture.
 *
 * Pure functions of (events, time): the preview, the renderer and the tests all agree because there is
 * nothing else to disagree with. Events are in CLIP time; the recording's own time is only needed to know
 * which face sample to frame by (`clipToSource`).
 */

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, t) => a + (b - a) * t;
export const ease = (p) => {
  const x = clamp(p, 0, 1);
  return x * x * (3 - 2 * x);
};

export const DEFAULT_DURATION = { emphasis: 1.0, number: 2.2, statement: 2.4, comparison: 5, annotation: 1.6, board: 5 };
export const durationOf = (e) => e.duration ?? DEFAULT_DURATION[e.type] ?? 1;

/** Clip seconds -> seconds in the source recording (which stretch of it is playing). */
export function clipToSource(segments, t) {
  for (const s of segments) if (t >= s.clipStart - 0.05 && t <= s.clipEnd + 0.05) return s.start + clamp(t - s.clipStart, 0, s.end - s.start);
  const last = segments[segments.length - 1];
  return last ? last.end : 0;
}

/* --------------------------------- camera --------------------------------- */

const targetOf = (e) => (e.action === 'punch_in' ? { zoom: clamp(e.amount || 1.12, CAMERA.minZoom, CAMERA.maxZoom), wide: 0 } : e.action === 'punch_out' ? { zoom: 1, wide: 1 } : { zoom: 1, wide: 0 });

/** { zoom, wide } at t: tighter for a punch-in, toward the whole frame for a punch-out, eased between moves. */
export function cameraAt(events, t) {
  const cams = events.filter((e) => e.type === 'camera').sort((a, b) => a.at - b.at);
  let from = { zoom: 1, wide: 0 };
  let state = from;
  for (let i = 0; i < cams.length; i += 1) {
    const e = cams[i];
    if (t < e.at) break;
    const target = targetOf(e);
    const next = cams[i + 1];
    if (next && next.at <= t) {
      from = target; // finished, or overtaken by the next move
      state = target;
      continue;
    }
    const p = ease((t - e.at) / MOTION.cameraRamp);
    state = { zoom: lerp(from.zoom, target.zoom, p), wide: lerp(from.wide, target.wide, p) };
  }
  return state;
}

/* ------------------------------ board / comparison ------------------------------ */

/** The card on screen: how far the layout has moved toward "showing it" (0-1), which event, and its own clock. */
export function cardAt(events, t) {
  const R = MOTION.ramp;
  let best = { amount: 0, event: null, localT: 0 };
  for (const e of events) {
    if (e.type !== 'board' && e.type !== 'comparison') continue;
    const end = e.at + durationOf(e);
    if (t < e.at || t > end + R) continue;
    const amount = t < end ? ease((t - e.at) / R) : ease((end + R - t) / R);
    if (amount >= best.amount) best = { amount, event: e, localT: t - e.at };
  }
  return best;
}

/* ------------------------------ top of the screen ------------------------------ */

/** The emphasis / number / statement popping at t, each with how long it has been on screen. */
export function popsAt(events, t) {
  return events
    .filter((e) => e.type === 'emphasis' || e.type === 'number' || e.type === 'statement')
    .map((e) => ({ event: e, localT: t - e.at, duration: durationOf(e) }))
    .filter((p) => p.localT >= 0 && p.localT < p.duration + MOTION.exit);
}

/** word index -> strongest emphasis on it, for captions and for the pop. */
export function emphasisByWord(events) {
  const map = new Map();
  for (const e of events) {
    if (e.type !== 'emphasis' || !e.words) continue;
    for (let i = e.words[0]; i <= e.words[1]; i += 1) map.set(i, Math.max(map.get(i) || 0, e.strength || 2));
  }
  return map;
}

export function annotationsAt(events, t) {
  return events.filter((e) => e.type === 'annotation' && t >= e.at && t < e.at + durationOf(e) + MOTION.exit).map((e) => ({ event: e, localT: t - e.at, duration: durationOf(e) }));
}

/* ----------------------------------- layout ----------------------------------- */

/**
 * Where everything is at clip time t.
 *   window     the speaker window on the 1080x1920 canvas {x, y, w, h}
 *   viewport   the part of the source frame it shows, in source pixels
 *   card       { amount, event, localT } for the board / comparison card
 */
export function layoutAt(t, props) {
  const { settings, source, framing, segments, events } = props;
  const aspect = ASPECTS[settings.aspect] || ASPECTS['4:3'];
  const cam = cameraAt(events, t);
  const card = cardAt(events, t);
  const full = source.width / source.height;

  // Showing a board visual, the speaker steps down to the whole, uncropped frame: every gesture stays in view.
  const winAspect = lerp(aspect, full, Math.max(cam.wide, card.amount));
  const winH = LAYOUT.windowW / winAspect;
  const talkCenter = Math.max(LAYOUT.talkCenterY, LAYOUT.talkTop + winH / 2);
  const centerY = lerp(talkCenter, LAYOUT.splitCenterY, card.amount);
  const window = { x: 0, y: centerY - winH / 2, w: LAYOUT.windowW, h: winH };

  const face = faceAt(framing, clipToSource(segments, t));
  const viewport = cropFor({ source, face, aspect: winAspect, handsRoom: settings.handsRoom, zoom: cam.zoom });
  return { window, viewport, card, cam, face };
}
