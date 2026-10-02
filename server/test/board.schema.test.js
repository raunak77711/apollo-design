import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BLOCK_TYPES, LIMITS, degradedSection, iconOf, normalizeBlock, normalizeBoard, normalizeOutline, normalizeSection,
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
  const blocks = Array.from({ length: 16 }, () => SAMPLES.statement);
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

test('equation: terms, a normalised operator, and an optional result', () => {
  const b = normalizeBlock({ type: 'equation', terms: ['A', { label: 'B' }, ''], operator: 'x', result: 'C' });
  assert.deepEqual(b.terms, ['A', 'B']);
  assert.equal(b.operator, '×');
  assert.equal(b.result, 'C');
  assert.equal(b.resultTone, 'money');
  assert.equal(normalizeBlock({ type: 'equation', terms: ['A'] }), null);
  assert.equal(normalizeBlock({ type: 'equation', terms: ['A', 'B'], operator: '-' }).operator, '−');
  assert.equal('result' in normalizeBlock({ type: 'equation', terms: ['A', 'B'] }), false);
});

test('loop needs three nodes; the centre is optional', () => {
  assert.equal(normalizeBlock({ type: 'loop', nodes: ['a', 'b'] }), null);
  const b = normalizeBlock({ type: 'loop', center: 'LOOP', steps: ['a', 'b', 'c'] });
  assert.deepEqual(b.nodes, [{ label: 'a' }, { label: 'b' }, { label: 'c' }]);
  assert.equal(b.center, 'LOOP');
});

test('matrix pads short rows, drops empty ones, and gives each column a tone', () => {
  const b = normalizeBlock({ type: 'matrix', columns: ['A', 'B', 'C'], tones: ['tech', 'nope'], rows: [['1', '2'], [], ['x', 'y', 'z', 'extra'], { cells: ['p', 'q', 'r'] }] });
  assert.deepEqual(b.rows, [['1', '2', ''], ['x', 'y', 'z'], ['p', 'q', 'r']]);
  assert.deepEqual(b.tones, ['tech', 'ink', 'ink']);
  assert.equal(normalizeBlock({ type: 'matrix', columns: ['A'], rows: [['1']] }), null);
  assert.equal(normalizeBlock({ type: 'matrix', columns: ['A', 'B'], rows: [] }), null);
});

test('bucket keeps its leaks and defaults to the problem tone', () => {
  const b = normalizeBlock({ type: 'bucket', top: 'TRAFFIC', holes: ['SLOW', 'NO TRUST'] });
  assert.deepEqual(b.leaks, [{ label: 'SLOW' }, { label: 'NO TRUST' }]);
  assert.equal(b.tone, 'problem');
  assert.equal(normalizeBlock({ type: 'bucket', leaks: ['one'] }), null);
});

test('list needs two items and keeps details', () => {
  const b = normalizeBlock({ type: 'list', items: [{ label: 'A', detail: 'why' }, 'B', ''] });
  assert.deepEqual(b.items, [{ label: 'A', detail: 'why' }, { label: 'B' }]);
  assert.equal(normalizeBlock({ type: 'list', items: ['only'] }), null);
});

test('statements may be inverse; sections and outlines carry a kicker', () => {
  assert.equal(normalizeBlock({ type: 'statement', text: 'x', emphasis: 'inverse' }).emphasis, 'inverse');
  const { section } = normalizeSection({ title: 'T', kicker: 'SCENE 3', blocks: [SAMPLES.title] }, 2);
  assert.equal(section.kicker, 'SCENE 3');
  assert.equal(normalizeOutline({ sections: [{ title: 'T', kicker: 'OPEN' }] }).sections[0].kicker, 'OPEN');
  assert.equal(degradedSection(0, { title: 'T', kicker: 'OPEN' }).kicker, 'OPEN');
});

test('icons are matched case- and alias-tolerantly and unknown ones are dropped', () => {
  assert.equal(iconOf('Snowflake'), 'snowflake');
  assert.equal(iconOf('AlertTriangle'), 'triangle-alert');
  assert.equal(iconOf('home'), 'house');
  assert.equal(iconOf('definitely-not-an-icon'), '');
  assert.equal(iconOf(7), '');
  const b = normalizeBlock({ type: 'flow', steps: [{ label: 'A', icon: 'search' }, { label: 'B', icon: 'nope' }] });
  assert.equal(b.steps[0].icon, 'search');
  assert.equal('icon' in b.steps[1], false);
});

test('moment keeps its hero icon and up to four chips', () => {
  const b = normalizeBlock(SAMPLES.moment);
  assert.equal(b.icon, 'user');
  assert.deepEqual(b.chips.map((c) => c.icon), ['clock', 'snowflake']);
  assert.equal(b.chips[1].tone, 'problem');
  assert.equal(normalizeBlock({ type: 'moment', text: '' }), null);
});

test('meter clamps values, keeps displays and totals', () => {
  const b = normalizeBlock({ type: 'meter', items: [{ label: 'a', value: '140%' }, { label: 'b', value: -5 }, { label: 'c' }], total: { label: 'T', display: '+60' } });
  assert.deepEqual(b.items.map((i) => i.value), [100, 0, 50]);
  assert.deepEqual(b.total, { label: 'T', display: '+60' });
  assert.equal(normalizeBlock({ type: 'meter', items: [{ label: 'only', value: 1 }] }), null);
});

test('eliminate validates its order and always leaves a survivor', () => {
  assert.deepEqual(normalizeBlock({ type: 'eliminate', options: ['A', 'B', 'C', 'D'], order: [2, 9, 2, 3] }).order, [2, 3]);
  assert.deepEqual(normalizeBlock({ type: 'eliminate', options: ['A', 'B', 'C'], order: [1, 2, 3] }).order, [1, 2]);
  assert.deepEqual(normalizeBlock({ type: 'eliminate', options: ['A', 'B', 'C'] }).order, [1, 2]);
  assert.equal(normalizeBlock({ type: 'eliminate', options: ['A', 'B'] }), null);
});

test('track needs both ends; stops are optional', () => {
  assert.equal(normalizeBlock({ type: 'track', start: 'A' }), null);
  const b = normalizeBlock({ type: 'track', start: 'ME', end: 'BUY', title: 'DISTANCE' });
  assert.deepEqual(b.stops, []);
  assert.equal(b.title, 'DISTANCE');
  assert.equal(normalizeBlock(SAMPLES.track).stops.length, 5);
});

test('zones needs an inside; the outside is optional', () => {
  assert.equal(normalizeBlock({ type: 'zones', outside: { items: ['x'] } }), null);
  const b = normalizeBlock(SAMPLES.zones);
  assert.equal(b.inside.tone, 'money');
  assert.equal(b.outside.tone, 'problem');
  assert.equal('outside' in normalizeBlock({ type: 'zones', inside: { items: ['x'] } }), false);
});

test('a title eyebrow that repeats the section kicker is dropped', () => {
  const { section } = normalizeSection({ title: 'T', kicker: 'OPEN', blocks: [{ type: 'title', text: 'HELLO', eyebrow: 'Open' }, { type: 'title', text: 'B', eyebrow: 'different' }] }, 0);
  assert.equal('eyebrow' in section.blocks[0], false);
  assert.equal(section.blocks[1].eyebrow, 'different');
});
