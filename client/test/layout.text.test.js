import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutBoard } from '../src/components/board/engine/layoutBoard.js';
import { sanitizeSpec } from '../src/components/board/state/boardRecord.js';
import { stubMeasure } from './helpers/stubMeasure.js';
import { SAMPLES } from '../../server/test/fixtures/boardSamples.js';

const sceneOf = (block, density = 3) =>
  layoutBoard(sanitizeSpec({ title: 'T', sections: [{ title: 'S', density, blocks: [block] }] }), stubMeasure);
const textOf = (scene, suffix) => scene.items.find((i) => i.id.endsWith(suffix));

test('a title is auto-fitted so no explicit line wraps, and never exceeds 760 wide', () => {
  const scene = sceneOf(SAMPLES.title);
  const t = textOf(scene, '.text');
  assert.ok(t.w <= 760);
  assert.equal(stubMeasure(t.text, t.font, t.w).lines, 3);
  assert.ok(t.font.size < 128, 'the xl title had to shrink to fit "YOUR WEBSITE" on one line');
  assert.ok(t.font.size >= 72);
});

test('a title eyebrow is small mono caps above the title', () => {
  const scene = sceneOf({ type: 'title', text: 'WHY', size: 'l', eyebrow: 'chapter one' });
  const eyebrow = textOf(scene, '.eyebrow');
  assert.equal(eyebrow.text, 'CHAPTER ONE');
  assert.equal(eyebrow.font.family, 'IBM Plex Mono');
  assert.ok(eyebrow.cy < textOf(scene, '.text').cy);
});

test('a statement uses its tone colour and stays inside the 700 safe column', () => {
  const t = textOf(sceneOf(SAMPLES.statement), '.text');
  assert.equal(t.color, '#c81e3a');
  assert.equal(t.w, 700);
});

test('a very long loud statement shrinks rather than growing past six lines', () => {
  const long = { type: 'statement', text: 'WORD '.repeat(27).trim(), emphasis: 'loud' };
  const t = textOf(sceneOf(long), '.text');
  assert.ok(stubMeasure(t.text, t.font, t.w).lines <= 6);
});

test('bigtype is one line, huge, with an optional caption below', () => {
  const scene = sceneOf(SAMPLES.bigtype);
  const t = textOf(scene, '.text');
  assert.equal(stubMeasure(t.text, t.font, t.w).lines, 1);
  assert.ok(t.font.size >= 64);
  assert.ok(textOf(scene, '.caption').cy > t.cy);
});

test('a quote is serif italic with an optional attribution', () => {
  const scene = sceneOf({ type: 'quote', text: '"Hello?"', attribution: '10:30 PM' });
  const q = textOf(scene, '.text');
  assert.equal(q.font.family, 'Source Serif 4');
  assert.equal(q.font.italic, true);
  assert.equal(textOf(scene, '.attribution').text, '10:30 PM');
});

test('code is a subordinate mono box, at least 16px, with an optional caption', () => {
  const scene = sceneOf({ type: 'code', text: '<a href="tel:+15551234567">', caption: 'the phone number is an action' });
  const box = scene.items.find((i) => i.kind === 'box');
  assert.equal(box.labelFont.family, 'IBM Plex Mono');
  assert.ok(box.labelFont.size >= 16);
  assert.ok(box.w <= 700);
  assert.ok(textOf(scene, '.caption'));
});

test('multi-line and emoji text lays out without throwing or collapsing', () => {
  const scene = sceneOf({ type: 'title', text: 'LINE ONE\nLINE TWO 💀', size: 'm' });
  assert.ok(textOf(scene, '.text').h > 0);
});
