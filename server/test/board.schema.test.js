import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BLOCK_TYPES, LIMITS, degradedSection, normalizeBlock, normalizeBoard, normalizeOutline, normalizeSection,
} from '../src/design/board/schema.js';
import { SAMPLES } from './fixtures/boardSamples.js';

test('every block type has a valid sample that normalizes', () => {
  for (const type of BLOCK_TYPES) {
    const block = normalizeBlock(SAMPLES[type]);
    assert.ok(block, `${type} sample should normalize`);
    assert.equal(block.type, type);
  }
});

test('flow accepts bare strings and objects, drops empties, defaults direction and scale', () => {
  const b = normalizeBlock({ type: 'flow', steps: ['GOOGLE', { label: 'WEBSITE', note: 'lands here' }, '', null, { text: 'CONTACT' }] });
  assert.deepEqual(b.steps.map((s) => s.label), ['GOOGLE', 'WEBSITE', 'CONTACT']);
  assert.equal(b.steps[1].note, 'lands here');
  assert.equal(b.direction, 'down');
  assert.equal(b.scale, 'normal');
});

test('flow with fewer than two usable steps is dropped', () => {
  assert.equal(normalizeBlock({ type: 'flow', steps: ['ONLY ONE', '', null] }), null);
});

test('types are matched case-insensitively and unknown types or non-objects are dropped', () => {
  assert.equal(normalizeBlock({ type: 'STATEMENT', text: 'Hi' }).type, 'statement');
  assert.equal(normalizeBlock({ type: 'carousel', text: 'x' }), null);
  assert.equal(normalizeBlock(null), null);
  assert.equal(normalizeBlock('text'), null);
});

test('long labels are clipped with an ellipsis and never rejected', () => {
  const b = normalizeBlock({ type: 'flow', steps: ['A'.repeat(200), 'B'] });
  assert.ok(b.steps[0].label.length <= LIMITS.label);
  assert.ok(b.steps[0].label.endsWith('…'));
});

test('arrays are capped at their maximum', () => {
  const nodes = Array.from({ length: 40 }, (_, i) => `N${i}`);
  const b = normalizeBlock({ type: 'hub', center: 'X', nodes });
  assert.equal(b.nodes.length, LIMITS.hubNodes[1]);
});

test('hub needs a centre and at least three nodes; nodes may be strings', () => {
  assert.equal(normalizeBlock({ type: 'hub', center: 'X', nodes: ['a', 'b'] }), null);
  assert.equal(normalizeBlock({ type: 'hub', nodes: ['a', 'b', 'c'] }), null);
  const ok = normalizeBlock({ type: 'hub', center: 'X', nodes: ['a', 'b', 'c'] });
  assert.deepEqual(ok.nodes, [{ label: 'a' }, { label: 'b' }, { label: 'c' }]);
  assert.equal(ok.links, 'spokes');
});

test('cards clamp columns and keep tags and tones', () => {
  const b = normalizeBlock({ type: 'cards', columns: 9, items: [{ label: 'a', tag: 'LEAK', tone: 'problem' }, { label: 'b' }] });
  assert.equal(b.columns, 4);
  assert.equal(b.items[0].tag, 'LEAK');
  assert.equal(b.items[0].tone, 'problem');
});

test('titles keep their line breaks; other text is collapsed to one line', () => {
  assert.equal(normalizeBlock({ type: 'title', text: 'YOUR WEBSITE\nIS LOSING' }).text, 'YOUR WEBSITE\nIS LOSING');
  assert.equal(normalizeBlock({ type: 'statement', text: 'a \n  b' }).text, 'a b');
});

test('unknown tones fall back to ink', () => {
  assert.equal(normalizeBlock({ type: 'statement', text: 'x', tone: 'neon' }).tone, 'ink');
});

test('emoji and unicode survive', () => {
  const b = normalizeBlock({ type: 'flow', steps: ['EDIT', '💀'] });
  assert.equal(b.steps[1].label, '💀');
});

test('normalizeSection assigns positional ids and reports dropped blocks', () => {
  const { section, issues } = normalizeSection(
    { title: 'THE SALE', beat: 'money', density: 9, blocks: [SAMPLES.title, { type: 'nope' }, SAMPLES.flow] },
    0
  );
  assert.equal(section.id, 's1');
  assert.equal(section.density, 5);
  assert.deepEqual(section.blocks.map((b) => b.id), ['s1.b1', 's1.b2']);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /block 2 dropped/);
});

test('normalizeSection reports a missing headline block', () => {
  const { issues } = normalizeSection({ title: 'x', blocks: [SAMPLES.flow] }, 2);
  assert.ok(issues.some((i) => /headline/.test(i)));
});

test('normalizeSection caps blocks per section', () => {
  const blocks = Array.from({ length: 14 }, () => SAMPLES.statement);
  const { section, issues } = normalizeSection({ title: 'x', blocks }, 0);
  assert.equal(section.blocks.length, LIMITS.blocks);
  assert.equal(issues.length, 4);
});

test('normalizeSection survives garbage', () => {
  const { section } = normalizeSection(null, 3);
  assert.equal(section.id, 's4');
  assert.equal(section.title, 'Section 4');
  assert.deepEqual(section.blocks, []);
});

test('degradedSection is a title plus a quiet statement, flagged', () => {
  const s = degradedSection(1, { title: 'HOW DID THEY FIND YOU?', beat: 'They searched and clicked.' });
  assert.equal(s.id, 's2');
  assert.equal(s.degraded, true);
  assert.deepEqual(s.blocks.map((b) => b.type), ['title', 'statement']);
  assert.equal(s.blocks[1].emphasis, 'quiet');
});

test('normalizeOutline clamps and rejects empties', () => {
  assert.equal(normalizeOutline({ sections: [] }), null);
  assert.equal(normalizeOutline({ sections: [{ beat: 'no title' }] }), null);
  assert.equal(normalizeOutline(null), null);
  const o = normalizeOutline({ title: 'T', sections: [{ title: 'One', density: 0 }, { title: 'Two', beat: 'b', density: 4 }] });
  assert.equal(o.sections.length, 2);
  assert.equal(o.sections[0].density, 1);
  assert.equal(o.title, 'T');
});

test('normalizeOutline caps section count', () => {
  const sections = Array.from({ length: 40 }, (_, i) => ({ title: `S${i}` }));
  assert.equal(normalizeOutline({ sections }).sections.length, LIMITS.sections);
});

test('normalizeBoard re-indexes after dropping empty sections', () => {
  const board = normalizeBoard({
    title: 'B',
    sections: [
      { title: 'A', blocks: [SAMPLES.title] },
      { title: 'empty', blocks: [{ type: 'nope' }] },
      { title: 'C', blocks: [SAMPLES.statement] },
    ],
  });
  assert.deepEqual(board.sections.map((s) => s.id), ['s1', 's2']);
  assert.deepEqual(board.sections.map((s) => s.title), ['A', 'C']);
  assert.equal(board.version, 1);
  assert.equal(normalizeBoard({ sections: [] }), null);
  assert.equal(normalizeBoard('x'), null);
});
