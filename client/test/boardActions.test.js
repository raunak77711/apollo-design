import test from 'node:test';
import assert from 'node:assert/strict';
import { outlineFromSpec, sectionHasWork, slugify } from '../src/components/board/boardActions.js';

test('slugify makes a safe filename', () => {
  assert.equal(slugify('Your Website Is Losing You Sales!'), 'your-website-is-losing-you-sales');
  assert.equal(slugify('  --  '), 'board');
  assert.equal(slugify('8:47 PM / part 2'), '8-47-pm-part-2');
});

test('sectionHasWork looks for overrides under that section only', () => {
  const state = { overrides: { 's3.b2.n1': { dx: 5 }, 's13.b1': { dx: 1 } } };
  assert.equal(sectionHasWork(state, 's3'), true);
  assert.equal(sectionHasWork(state, 's1'), false);
  assert.equal(sectionHasWork(state, 's1'), false, 's13 must not count as s1');
  assert.equal(sectionHasWork({ overrides: {} }, 's3'), false);
});

test('outlineFromSpec keeps only what the server needs to rebuild a section', () => {
  const spec = { title: 'T', audience: 'owners', sections: [{ id: 's1', title: 'A', beat: 'b', density: 2, blocks: [{}] }] };
  assert.deepEqual(outlineFromSpec(spec), { title: 'T', audience: 'owners', sections: [{ title: 'A', beat: 'b', density: 2 }] });
});
