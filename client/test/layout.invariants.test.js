import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutBoard } from '../src/components/board/engine/layoutBoard.js';
import { LAYOUTS } from '../src/components/board/engine/blocks/index.js';
import { sanitizeSpec } from '../src/components/board/state/boardRecord.js';
import { stubMeasure } from './helpers/stubMeasure.js';
import { checkScene } from './helpers/checkScene.js';
import { SAMPLES } from '../../server/test/fixtures/boardSamples.js';

const specOf = (...blocks) => sanitizeSpec({ title: 'T', sections: [{ title: 'S', density: 3, blocks }] });

for (const type of Object.keys(LAYOUTS)) {
  test(`${type}: centred, inside its block and section, legible, unique ids`, () => {
    const scene = layoutBoard(specOf(SAMPLES[type]), stubMeasure);
    assert.ok(scene.items.length > 0);
    checkScene(scene);
  });
}

test('several blocks in one section stack without overlapping', () => {
  const scene = layoutBoard(specOf(SAMPLES.title, SAMPLES.statement, SAMPLES.bigtype, SAMPLES.quote, SAMPLES.code), stubMeasure);
  checkScene(scene);
  const ys = Object.values(scene.blocks).map((b) => b.y);
  assert.deepEqual(ys, [...ys].sort((a, b) => a - b));
});

test('layout is deterministic: identical input gives identical scenes and ids', () => {
  const spec = specOf(SAMPLES.title, SAMPLES.statement);
  assert.deepEqual(layoutBoard(spec, stubMeasure), layoutBoard(spec, stubMeasure));
});

test('density changes whitespace: a sparse section is taller than a dense one with the same content', () => {
  const make = (density) => sanitizeSpec({ title: 'T', sections: [{ title: 'S', density, blocks: [SAMPLES.title, SAMPLES.statement] }] });
  assert.ok(layoutBoard(make(1), stubMeasure).height > layoutBoard(make(5), stubMeasure).height);
});

test('a section with no blocks still gets its minimum height', () => {
  const scene = layoutBoard({ version: 1, title: 'T', sections: [{ id: 's1', title: 'Empty', density: 3, blocks: [] }] }, stubMeasure);
  assert.equal(scene.sections[0].height, 780);
});

test('blocks are tagged onto their items', () => {
  const scene = layoutBoard(specOf(SAMPLES.statement), stubMeasure);
  assert.ok(scene.items.every((i) => i.block === 's1.b1' && i.section === 's1'));
});
