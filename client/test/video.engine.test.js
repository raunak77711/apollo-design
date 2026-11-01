import test from 'node:test';
import assert from 'node:assert/strict';
import { activeWord, cueAt, groupCaptions, toSrt } from '../src/video/captions.js';
import { ASPECTS, coverage, cropFor, faceAt, videoStyle } from '../src/video/framing.js';
import { OUTPUT, PLATFORMS, safeRect } from '../src/video/platforms.js';
import { annotationsAt, cameraAt, cardAt, clipToSource, emphasisByWord, layoutAt, popsAt } from '../src/video/timeline.js';
import { CAMERA, CANVAS, LAYOUT, MOTION } from '../src/video/theme.js';

const SOURCE = { width: 1280, height: 720 };
// Close to the real recording: face left of centre, high in the frame.
const FACE = { x: 0.31, y: 0.09, w: 0.2, h: 0.46 };

const words = (text, { start = 0, per = 0.4, gap = 0 } = {}) => {
  let t = start;
  return text.split(/\s+/).map((w, index) => {
    const out = { word: w, start: t, end: t + per, index };
    t += per + (/[.?!]$/.test(w) ? 0.7 : gap);
    return out;
  });
};

/* ---------------------------------- framing ---------------------------------- */

test('the default window is wide: three quarters of the frame, so the hands stay in', () => {
  const v = cropFor({ source: SOURCE, face: FACE, aspect: ASPECTS['4:3'] });
  assert.ok(Math.abs(v.h - 720) < 0.01); //            full height
  assert.ok(Math.abs(v.w - 960) < 0.01); //            960 of 1280
  assert.ok(Math.abs(coverage(v, SOURCE).width - 0.75) < 0.001);
  assert.ok(v.x >= 0 && v.x + v.w <= SOURCE.width);
});

test('the face is always inside the window, with room round it, wherever the speaker sits', () => {
  for (const x of [0.02, 0.2, 0.31, 0.5, 0.7, 0.8]) {
    for (const aspect of Object.values(ASPECTS)) {
      const face = { x, y: 0.1, w: 0.18, h: 0.4 };
      const v = cropFor({ source: SOURCE, face, aspect, handsRoom: 0.6 });
      assert.ok(v.x <= face.x * SOURCE.width + 1, `left edge clear at x=${x}, aspect=${aspect}`);
      assert.ok(v.x + v.w >= (face.x + face.w) * SOURCE.width - 1, `right edge clear at x=${x}, aspect=${aspect}`);
      assert.ok(v.x >= -0.001 && v.y >= -0.001 && v.x + v.w <= SOURCE.width + 0.001 && v.y + v.h <= SOURCE.height + 0.001);
    }
  }
});

test('leaning toward the middle (hands room) moves the window off the face, but never off the face', () => {
  const left = cropFor({ source: SOURCE, face: FACE, aspect: 1, handsRoom: 0 });
  const lean = cropFor({ source: SOURCE, face: FACE, aspect: 1, handsRoom: 1 });
  assert.ok(lean.x > left.x);
  assert.ok(lean.x <= FACE.x * SOURCE.width);
});

test('zooming in gets tighter and follows the face; wide shows the entire frame', () => {
  const base = cropFor({ source: SOURCE, face: FACE, aspect: ASPECTS['4:3'] });
  const tight = cropFor({ source: SOURCE, face: FACE, aspect: ASPECTS['4:3'], zoom: 1.2 });
  assert.ok(Math.abs(tight.w - base.w / 1.2) < 0.01);
  assert.ok(tight.h < base.h);
  const faceCentre = (FACE.x + FACE.w / 2) * SOURCE.width;
  assert.ok(Math.abs(tight.x + tight.w / 2 - faceCentre) < Math.abs(base.x + base.w / 2 - faceCentre));
  const wide = cropFor({ source: SOURCE, face: FACE, aspect: ASPECTS['4:3'], wide: 1 });
  assert.deepEqual([wide.x, wide.y, Math.round(wide.w), Math.round(wide.h)], [0, 0, 1280, 720]);
});

test('with no face found the window still frames sensibly, and a face is chosen by nearest time', () => {
  const v = cropFor({ source: SOURCE, face: null, aspect: 1 });
  assert.ok(v.x >= 0 && v.x + v.w <= SOURCE.width);
  const framing = { keyframes: [{ t: 1, face: { x: 0.3, y: 0.1, w: 0.2, h: 0.4 } }, { t: 600, face: { x: 0.2, y: 0.1, w: 0.2, h: 0.4 } }, { t: 1200, face: null }], head: { x: 0.3 } };
  assert.equal(faceAt(framing, 10).x, 0.3);
  assert.equal(faceAt(framing, 580).x, 0.2);
  assert.equal(faceAt(framing, 1500).x, 0.2); // 1200 found nothing: the last sample that did
  assert.equal(faceAt({ keyframes: [], head: { x: 0.5 } }, 5).x, 0.5);
  assert.equal(faceAt(null, 5), null);
});

test('the video style scales the source so only the viewport shows inside the window', () => {
  const v = { x: 160, y: 0, w: 960, h: 720 };
  const rect = { x: 0, y: 475, w: 1080, h: 810 };
  const s = videoStyle(v, rect, SOURCE);
  const k = 1080 / 960;
  assert.equal(s.width, SOURCE.width * k);
  assert.equal(s.left, -160 * k);
  assert.equal(s.top, 0);
  assert.ok(Math.abs(s.height - 720 * k) < 0.01);
});

/* ---------------------------------- captions ---------------------------------- */

test('captions break at sentences and pauses, stay short, and never leave an orphan', () => {
  const w = words('Most owners think they need more traffic. But traffic is not the problem and it never was.');
  const cues = groupCaptions(w, { maxWords: 4 });
  assert.ok(cues.every((c) => c.words.length <= 5));
  assert.ok(cues.every((c) => c.words.length >= 2));
  const flat = cues.flatMap((c) => c.words.map((x) => x.text));
  assert.deepEqual(flat, w.map((x) => x.word)); // nothing lost, nothing reordered
  const sentenceEnd = cues.find((c) => c.words.at(-1).text === 'traffic.');
  assert.ok(sentenceEnd, 'a cue ends where the sentence does');
  const paused = groupCaptions([...words('one two three', { gap: 0 }), ...words('four five six', { start: 3 })], { maxWords: 6 });
  assert.equal(paused.length, 2); // a long pause breaks the cue
});

test('the cue on screen appears a beat early, lingers briefly, and never overlaps the next; the active word follows speech', () => {
  const cues = groupCaptions(words('Traffic is not the problem. The leak is.'), { maxWords: 4 });
  assert.equal(cueAt(cues, -1), null);
  const first = cueAt(cues, cues[0].start - 0.03);
  assert.equal(first.index, 0);
  const between = cueAt(cues, cues[0].end + 0.1);
  assert.equal(between.index, 0); // still lingering
  const second = cueAt(cues, cues[1].start + 0.01);
  assert.equal(second.index, 1);
  assert.equal(cueAt(cues, 999), null);
  assert.equal(activeWord(cues[0], cues[0].start - 0.5), -1);
  assert.equal(activeWord(cues[0], cues[0].words[1].start + 0.05), 1);
});

test('subtitle files are valid SRT', () => {
  const srt = toSrt(groupCaptions(words('Hello there everyone. This is a test.'), { maxWords: 3 }));
  assert.match(srt, /^1\n00:00:00,000 --> 00:00:\d\d,\d{3}\nHello there everyone\.\n/);
  assert.match(srt, /\n\n2\n/);
});

/* --------------------------------- timeline --------------------------------- */

test('the camera eases in, holds, eases back; a punch-out widens toward the whole frame', () => {
  const ev = [{ type: 'camera', action: 'punch_in', at: 5, amount: 1.2 }, { type: 'camera', action: 'return', at: 9 }, { type: 'camera', action: 'punch_out', at: 14 }, { type: 'camera', action: 'return', at: 18 }];
  assert.deepEqual(cameraAt(ev, 1), { zoom: 1, wide: 0 });
  const mid = cameraAt(ev, 5 + MOTION.cameraRamp / 2);
  assert.ok(mid.zoom > 1 && mid.zoom < 1.2);
  assert.equal(cameraAt(ev, 7).zoom, 1.2);
  assert.equal(cameraAt(ev, 12).zoom, 1);
  assert.equal(cameraAt(ev, 16).wide, 1);
  assert.equal(cameraAt(ev, 30).wide, 0);
  // Never tighter than the limit, however a track asks.
  assert.equal(cameraAt([{ type: 'camera', action: 'punch_in', at: 0, amount: 9 }], 5).zoom, CAMERA.maxZoom);
});

test('the board card ramps in, stays, ramps out', () => {
  const ev = [{ type: 'board', at: 4, duration: 6, blockId: 's1.b1' }];
  assert.equal(cardAt(ev, 3).amount, 0);
  assert.ok(cardAt(ev, 4 + MOTION.ramp / 2).amount > 0 && cardAt(ev, 4 + MOTION.ramp / 2).amount < 1);
  assert.equal(cardAt(ev, 7).amount, 1);
  assert.equal(cardAt(ev, 7).localT, 3);
  assert.ok(cardAt(ev, 10 + MOTION.ramp / 2).amount < 1);
  assert.equal(cardAt(ev, 11).amount, 0);
  assert.equal(cardAt(ev, 0).event, null);
});

test('pops, emphasis words and annotations are found by time', () => {
  const ev = [
    { type: 'emphasis', at: 2, text: 'traffic', strength: 3, words: [3, 3], duration: 1 },
    { type: 'number', at: 5, value: '$10,000', duration: 2.2 },
    { type: 'annotation', at: 2, kind: 'underline', words: [3, 3], duration: 1.6 },
  ];
  assert.equal(popsAt(ev, 1).length, 0);
  assert.equal(popsAt(ev, 2.5).length, 1);
  assert.equal(popsAt(ev, 5.5)[0].event.type, 'number');
  assert.equal(popsAt(ev, 9).length, 0);
  assert.equal(emphasisByWord(ev).get(3), 3);
  assert.equal(annotationsAt(ev, 2.5).length, 1);
});

const PROPS = {
  settings: { aspect: '4:3', handsRoom: 0.35 },
  source: SOURCE,
  framing: { keyframes: [{ t: 1, face: FACE }], head: FACE },
  segments: [{ start: 100, end: 110, clipStart: 0, clipEnd: 10 }, { start: 120, end: 135, clipStart: 10, clipEnd: 25 }],
  events: [{ type: 'board', at: 10, duration: 8, blockId: 's1.b1' }, { type: 'camera', action: 'punch_in', at: 2, amount: 1.12 }, { type: 'camera', action: 'return', at: 6 }],
};

test('clip time maps onto the recording across a cut', () => {
  assert.equal(clipToSource(PROPS.segments, 3), 103);
  assert.equal(clipToSource(PROPS.segments, 12), 122);
  assert.equal(clipToSource(PROPS.segments, 99), 135);
});

test('talking: a wide window clear of the top of the screen; showing a board: the whole frame, below the card', () => {
  const talk = layoutAt(0.5, PROPS);
  assert.equal(talk.window.w, 1080);
  assert.ok(Math.abs(talk.window.h - 810) < 0.5); //  4:3
  assert.ok(talk.window.y >= LAYOUT.topZone.y + LAYOUT.topZone.h, 'the title area above the speaker is free');
  assert.equal(talk.card.amount, 0);

  const split = layoutAt(14, PROPS);
  assert.equal(split.card.amount, 1);
  assert.ok(Math.abs(split.window.h - 607.5) < 0.5); //  16:9: nothing cropped
  assert.ok(split.window.y >= LAYOUT.card.y + LAYOUT.card.h, 'the speaker sits below the board card');
  assert.deepEqual([split.viewport.x, split.viewport.y, Math.round(split.viewport.w), Math.round(split.viewport.h)], [0, 0, 1280, 720]);
  assert.ok(split.window.y + split.window.h <= CANVAS.h);
});

test('every window at every moment stays inside the canvas and shows only real pixels of the source', () => {
  for (let t = 0; t <= 25; t += 0.25) {
    for (const aspect of Object.keys(ASPECTS)) {
      const l = layoutAt(t, { ...PROPS, settings: { ...PROPS.settings, aspect } });
      assert.ok(l.window.y >= 0 && l.window.y + l.window.h <= CANVAS.h, `window on canvas at t=${t} (${aspect})`);
      assert.ok(l.viewport.x >= -0.001 && l.viewport.y >= -0.001 && l.viewport.x + l.viewport.w <= SOURCE.width + 0.001 && l.viewport.y + l.viewport.h <= SOURCE.height + 0.001);
      assert.ok(Math.abs(l.viewport.w / l.viewport.h - l.window.w / l.window.h) < 0.001, 'the video is never stretched');
    }
  }
});

test('a punch-in is gentle: the hands stay in view', () => {
  const l = layoutAt(4, PROPS);
  assert.ok(l.cam.zoom <= CAMERA.maxZoom);
  assert.ok(coverage(l.viewport, SOURCE).width >= 0.6, 'still shows at least 60% of the frame width');
});

/* ---------------------------------- the safe zone ---------------------------------- */

test('captions and the top-zone pops sit inside the strictest safe zone', () => {
  const safe = safeRect('universal');
  assert.ok(LAYOUT.topZone.y >= safe.y);
  assert.ok(LAYOUT.topZone.x >= safe.x && LAYOUT.topZone.x + LAYOUT.topZone.w <= safe.x + safe.w);
  assert.ok(LAYOUT.card.x >= safe.x && LAYOUT.card.x + LAYOUT.card.w <= safe.x + safe.w, 'the board card clears the right-hand buttons');
  assert.ok(LAYOUT.captionW <= safe.w);
  assert.ok(LAYOUT.captionY + 70 <= safe.y + safe.h, 'two caption lines end above the platform controls');
  assert.ok(LAYOUT.card.y >= safe.y - 10);
  assert.equal(CANVAS.w, OUTPUT.width);
  assert.ok(PLATFORMS.tiktok.safe.right > 0);
});
