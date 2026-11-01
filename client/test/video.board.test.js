import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutBoard } from '../src/components/board/engine/layoutBoard.js';
import { sanitizeSpec } from '../src/components/board/state/boardRecord.js';
import { groupFromPath, groupPieces, pieceOf, revealTimes, sideFromPath } from '../src/video/boardScene.js';
import { stubMeasure } from './helpers/stubMeasure.js';
import { SAMPLES } from '../../server/test/fixtures/boardSamples.js';

const sceneOf = (block) => {
  const spec = sanitizeSpec({ title: 'T', sections: [{ title: 'S', density: 3, blocks: [block] }] });
  const scene = layoutBoard(spec, stubMeasure);
  return { scene, blockId: spec.sections[0].blocks[0].id, items: scene.items.filter((i) => i.block === spec.sections[0].blocks[0].id) };
};

test('a part path becomes the number of the group of pieces that draws it', () => {
  assert.equal(groupFromPath('steps.0'), 1);
  assert.equal(groupFromPath('steps.2'), 3);
  assert.equal(groupFromPath('items.1.detail'), 2);
  assert.equal(groupFromPath('left.steps.4'), 5);
  assert.equal(groupFromPath('rows.1.0'), 2);
  assert.equal(groupFromPath('text'), 0);
  assert.equal(groupFromPath('center'), 0);
  assert.equal(groupFromPath(undefined), 0);
  assert.equal(sideFromPath('left.steps.1'), 1);
  assert.equal(sideFromPath('outside.items.0'), 2);
  assert.equal(sideFromPath('steps.1'), 0);
});

test('every piece of a flow belongs to the step it draws; its arrows arrive with the later step', () => {
  const { items, blockId } = sceneOf({ type: 'flow', direction: 'down', steps: [{ label: 'A', icon: 'search' }, 'B', 'C'] });
  const { pieces, groups } = groupPieces(items, blockId);
  assert.equal(groups, 3);
  assert.equal(pieces.get(`${blockId}.n1`).group, 1);
  assert.equal(pieces.get(`${blockId}.n1.icon`).group, 1); // an icon travels with its step
  assert.equal(pieces.get(`${blockId}.n3`).group, 3);
  const arrows = items.filter((i) => i.kind === 'connector');
  assert.deepEqual(arrows.map((a) => pieces.get(a.id).group), [2, 3]); // the arrow into step 2 shows with step 2
});

test('static furniture is group 0: the bucket, its water, a loop centre, a headline', () => {
  const bucket = sceneOf(SAMPLES.bucket);
  const g = groupPieces(bucket.items, bucket.blockId);
  assert.equal(g.pieces.get(`${bucket.blockId}.body`).group, 0);
  assert.equal(g.pieces.get(`${bucket.blockId}.water`).group, 0);
  assert.equal(g.pieces.get(`${bucket.blockId}.l3`).group, 3);
  assert.equal(g.pieces.get(`${bucket.blockId}.h3`).group, 3); // hole, label, drip and arrow share a number
  const loop = sceneOf(SAMPLES.loop);
  assert.equal(groupPieces(loop.items, loop.blockId).pieces.get(`${loop.blockId}.center`).group, 0);
});

test('two-sided blocks put their sides in different groups', () => {
  const { items, blockId } = sceneOf({ type: 'compare', left: { heading: 'A', steps: ['x', 'y'] }, right: { heading: 'B', steps: ['p', 'q'] } });
  const { pieces, sides } = groupPieces(items, blockId);
  assert.equal(sides, 2);
  assert.equal(pieces.get(`${blockId}.l.n1`).side, 1);
  assert.equal(pieces.get(`${blockId}.r.n2`).side, 2);
});

test('progressive: parts appear when they are said, in order, never all at once', () => {
  const { times } = revealTimes({
    animation: 'progressive', groups: 4, sides: 0, eventAt: 10, duration: 8,
    hits: [{ path: 'steps.0', at: 10.5 }, { path: 'steps.1', at: 12.4 }, { path: 'steps.3', at: 16.2 }],
  });
  assert.equal(times.get(0), 0);
  assert.ok(Math.abs(times.get(1) - 0.38) < 0.01); // said at +0.5, shown a hair early
  assert.ok(Math.abs(times.get(2) - 2.28) < 0.01);
  assert.ok(times.get(3) > times.get(2) && times.get(3) < times.get(4), 'a part nobody spoke about still arrives, between its neighbours');
  assert.ok(Math.abs(times.get(4) - 6.08) < 0.01);
  for (let g = 2; g <= 4; g += 1) assert.ok(times.get(g) > times.get(g - 1));
  assert.ok(times.get(4) <= 8 - 0.89, 'every part is up before the block leaves');
});

test('progressive with nothing timed staggers the parts; reveal shows all at once; focus and highlight show everything', () => {
  const staggered = revealTimes({ animation: 'progressive', groups: 3, sides: 0, eventAt: 0, duration: 8 });
  assert.ok(staggered.times.get(1) < staggered.times.get(2) && staggered.times.get(2) < staggered.times.get(3));
  const all = revealTimes({ animation: 'reveal', groups: 5, sides: 0, eventAt: 0, duration: 4 });
  assert.ok([...all.times.values()].every((t) => t < 0.4));
  for (const a of ['focus', 'highlight']) {
    const r = revealTimes({ animation: a, groups: 3, sides: 0, eventAt: 0, duration: 4 });
    assert.ok([...r.times.values()].every((t) => t < 0.3));
  }
});

test('compare: the left side first, the right side when the speaker gets to it', () => {
  const spoken = revealTimes({ animation: 'compare', groups: 2, sides: 2, eventAt: 5, duration: 9, hits: [{ path: 'left.steps.0', at: 5.4 }, { path: 'right.steps.0', at: 9.5 }] });
  assert.ok(spoken.sideTimes.get(1) < 0.2);
  assert.ok(Math.abs(spoken.sideTimes.get(2) - 4.4) < 0.01);
  const unspoken = revealTimes({ animation: 'compare', groups: 2, sides: 2, eventAt: 0, duration: 10 });
  assert.ok(unspoken.sideTimes.get(2) > unspoken.sideTimes.get(1) + 1);
});

test('every block type in the board vocabulary has pieces that group without error', () => {
  for (const [type, block] of Object.entries(SAMPLES)) {
    const { items, blockId } = sceneOf(block);
    const { pieces, groups } = groupPieces(items, blockId);
    assert.equal(pieces.size, items.length, `${type}: every piece is grouped`);
    assert.ok(groups >= 0);
    const byId = new Map(items.map((i) => [i.id, i]));
    for (const i of items) assert.ok(Number.isInteger(pieceOf(i, blockId, byId).group));
  }
});
