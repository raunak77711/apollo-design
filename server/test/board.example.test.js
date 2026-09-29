import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HEADLINE_TYPES, normalizeBoard, normalizeSection } from '../src/design/board/schema.js';

const raw = JSON.parse(readFileSync(new URL('../../client/src/components/board/example/website-is-losing-you-sales.json', import.meta.url), 'utf8'));

test('the example board is twelve sections and loses nothing in normalization', () => {
  assert.equal(raw.sections.length, 12);
  raw.sections.forEach((section, i) => {
    const { section: clean, issues } = normalizeSection(section, i);
    assert.deepEqual(issues, [], `section ${i + 1} (${section.title}) has issues`);
    assert.equal(clean.blocks.length, section.blocks.length, `section ${i + 1} dropped a block`);
    assert.ok(clean.blocks.some((b) => HEADLINE_TYPES.includes(b.type)), `section ${i + 1} has a headline`);
  });
  assert.equal(normalizeBoard(raw).sections.length, 12);
});
