import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { layoutBoard } from '../src/components/board/engine/layoutBoard.js';
import { sanitizeSpec } from '../src/components/board/state/boardRecord.js';
import { stubMeasure } from './helpers/stubMeasure.js';
import { checkScene } from './helpers/checkScene.js';

const spec = sanitizeSpec(JSON.parse(readFileSync(new URL('../src/components/board/example/website-is-losing-you-sales.json', import.meta.url), 'utf8')));
const scene = layoutBoard(spec, stubMeasure);

test('the example lays out cleanly: contiguous, centred, inside their sections, legible', () => {
  assert.equal(scene.sections.length, 12);
  checkScene(scene);
});

test('it keeps the brief\'s labels verbatim', () => {
  const texts = scene.items.map((i) => i.text || i.label || '').join('|');
  for (const s of ['$1,500 JOB', 'AD / ORGANIC RESULT', 'LOADING...', 'CUSTOMER LEAVES', '8:47 PM', 'FIELD-LOCKED CMS', 'THE RIDICULOUS STACK']) {
    assert.ok(texts.includes(s), `missing "${s}"`);
  }
});

test('the density arc is simple, then complex, then chaos, then simplified', () => {
  const densities = spec.sections.map((s) => s.density);
  assert.equal(densities[0], 1);
  assert.equal(Math.max(...densities), 5);
  assert.equal(densities.indexOf(5), 10, 'the ridiculous stack (section 11) is the visual peak');
  assert.equal(densities[11], 1, 'web operations resets to sparse');
});

test('the ridiculous stack is the busiest section on the board', () => {
  const count = (sectionId) => scene.items.filter((i) => i.section === sectionId).length;
  const peak = count('s11');
  for (const s of scene.sections) if (s.id !== 's11') assert.ok(count(s.id) < peak, `${s.id} is busier than the peak`);
});

test('the final section is quiet and introduces KIT last and small', () => {
  const last = scene.items.filter((i) => i.section === 's12');
  const kit = last.find((i) => i.text === 'KIT');
  assert.ok(kit, 'KIT appears in the last section');
  assert.ok(kit.font.size <= 56, 'KIT is not a hero');
  assert.ok(!scene.items.filter((i) => i.section !== 's12').some((i) => i.text === 'KIT'), 'KIT appears nowhere earlier');
});
