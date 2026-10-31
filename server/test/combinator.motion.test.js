import test from 'node:test';
import assert from 'node:assert/strict';
import { editingRules, validateMotionPlan, planMotion, createCombinatorMotion } from '../src/services/combinatorMotion.js';
import { captionCues, makeAss } from '../src/services/combinatorCaptions.js';
import { clipLayout } from '../src/services/combinatorLayout.js';

test('editing rules enforce bounded subtitle placement, size and phrase length', () => {
  assert.deepEqual(editingRules(), { subtitlePosition: 'auto', subtitleSize: 'medium', maxWords: 4 });
  for (const rules of [{ subtitlePosition: 'offscreen' }, { subtitleSize: 500 }, { maxWords: 0 }]) assert.throws(() => editingRules(rules));
  const cues = captionCues([{ text: 'one two three four five six seven', start: 0, end: 7 }], { maxWords: 3 });
  assert.deepEqual(cues.map(c => c.text), ['one two three', 'four five six', 'seven']);
  for (const [position, y] of [['upper', 345.59999999999997], ['middle', 1094.3999999999999], ['lower', 1459.2]]) {
    const ass = makeAss({ width: 1080, height: 1920, duration: 2, segments: [{ start: 0, end: 1, text: 'Safe caption' }], rules: editingRules({ subtitlePosition: position }) });
    assert.ok(ass.includes(`\\pos(486,${y})`), position);
  }
});

test('animation plans use transcript excerpts, clip bounds and non-overlapping timing', async () => {
  const cues = [{ start: .1, end: 2, text: 'Build a useful library' }, { start: 1, end: 3, text: 'Never repeat your content' }, { start: 10, end: 12, text: 'Save more time' }];
  const result = { events: [{ cueId: 0, type: 'keyword', text: 'useful library' }, { cueId: 1, type: 'underline', text: 'repeat' }, { cueId: 2, type: 'takeaway', text: 'Save more time' }] };
  const events = validateMotionPlan(result, cues, 20);
  assert.equal(events.length, 2);
  assert.ok(events[1].start >= events[0].end + 2);
  assert.throws(() => validateMotionPlan({ events: [{ cueId: 0, type: 'keyword', text: 'Earn $10000' }] }, cues, 20), /transcript/);
  assert.throws(() => validateMotionPlan({ events: [{ cueId: 0, type: 'script', text: 'library' }] }, cues, 20));
  assert.throws(() => validateMotionPlan({ events: [{ cueId: 99, type: 'keyword', text: 'library' }] }, cues, 20));
  assert.deepEqual(await planMotion([], 2, 'hooks', { chat: () => { throw new Error('No call for silence'); } }), []);
  const grounded = await planMotion(cues, 20, 'bodies', { chat: async () => ({ events: [{ cueId: 0, type: 'keyword', text: 'Invented marketing claim' }, { cueId: 999, type: 'keyword' }] }) });
  assert.equal(grounded[0].text, cues[0].text, 'On-screen text comes from speech even if the model paraphrases');
});

test('HTML renderer requires the matching worker and confines paths to shared storage', async () => {
  const motion = createCombinatorMotion({ storageRoot: process.cwd(), client: { health: async () => ({ ok: true, ffmpeg: true }) } });
  assert.equal((await motion.status()).available, false);
  await assert.rejects(() => motion.render('../outside.mp4', 'output.mp4', {}), /shared server storage/);
});

test('TikTok fill uses source dimensions and keeps overlays away from detected faces', () => {
  const layout = clipLayout({ width: 2160, height: 4676 }, 1080, 1920, { method: 'yunet', head: { x: .35, y: .26, w: .25, h: .16 } }, { subtitlePosition: 'auto' });
  assert.equal(layout.crop.w, 2160); assert.equal(layout.crop.h, 3840); assert.equal(layout.faceDetected, true);
  const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  for (const face of layout.faces) { assert.equal(overlaps(layout.animationRect, face), false); assert.equal(overlaps(layout.captionRect, face), false); }
  assert.ok(layout.captionRect.y + layout.captionRect.h <= 1470);
  const ctaLayout = clipLayout({ width: 2160, height: 4676 }, 1080, 1920, { method: 'yunet', head: { x: .35, y: .26, w: .25, h: .16 } }, { subtitlePosition: 'auto' }, true);
  for (const face of ctaLayout.faces) { assert.equal(overlaps(ctaLayout.animationRect, face), false); assert.equal(overlaps(ctaLayout.contactRect, face), false); }
  assert.equal(overlaps(ctaLayout.animationRect, ctaLayout.contactRect), false);
});

test('Content Factory director events produce comparisons and spoken numbers', async () => {
  const cues = [{ start: 0, end: 4, text: 'Traffic is high but conversion is low.' }, { start: 8, end: 12, text: 'That costs 100 dollars every day.' }];
  const events = await planMotion(cues, 15, 'bodies', { chat: async () => ({ events: [{ type: 'comparison', at: 1, left: 'Traffic', right: 'Conversion', duration: 4 }, { type: 'number', at: 8, value: '100', duration: 2 }] }) });
  assert.deepEqual(events.map(e => e.type), ['comparison', 'number']); assert.equal(events[0].left, 'Traffic'); assert.ok(events[1].start >= 8);
});
