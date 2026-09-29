import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCK_TYPES, TONES } from '../src/design/board/schema.js';
import { BLOCK_SHAPES, buildOutlinePrompt, buildSectionPrompt } from '../src/design/board/prompts.js';

const BRIEF = 'A video about slow websites.\n\n## 1. THE SALE\nGoogle ↓ Website ↓ Lead';
const outline = {
  title: 'Slow sites', audience: 'business owners',
  sections: [{ title: 'THE SALE', beat: 'money', density: 1 }, { title: 'THE LEAK', beat: 'loss', density: 4 }, { title: 'THE FIX', beat: 'relief', density: 2 }],
};

test('every block type has a JSON shape in the vocabulary', () => {
  for (const type of BLOCK_TYPES) assert.ok(BLOCK_SHAPES[type], `missing shape for ${type}`);
});

test('the section system prompt teaches every block type and every tone', () => {
  const { system } = buildSectionPrompt({ brief: BRIEF, outline, index: 0 });
  for (const type of BLOCK_TYPES) assert.ok(system.includes(`"type":"${type}"`), `system prompt lacks ${type}`);
  for (const tone of TONES) assert.ok(system.includes(tone), `system prompt lacks tone ${tone}`);
  assert.match(system, /never write hex/i);
  assert.match(system, /EXACTLY/);
});

test('the brief leads every section prompt and the prefix is identical across sections', () => {
  const a = buildSectionPrompt({ brief: BRIEF, outline, index: 0 });
  const b = buildSectionPrompt({ brief: BRIEF, outline, index: 2, note: 'more visual' });
  const prefix = `BRIEF:\n${BRIEF}\n\n---\n\n`;
  assert.ok(a.user.startsWith(prefix));
  assert.ok(b.user.startsWith(prefix));
  assert.equal(a.system, b.system);
});

test('the section prompt names the section, its neighbours, density and any note', () => {
  const { user } = buildSectionPrompt({ brief: BRIEF, outline, index: 1, note: 'make the graph huge' });
  assert.match(user, /Build section 2 of 3: "THE LEAK"/);
  assert.match(user, /Previous section: "THE SALE"/);
  assert.match(user, /Next section: "THE FIX"/);
  assert.match(user, /Density: 4\/5/);
  assert.match(user, /make the graph huge/);
});

test('first and last sections say so', () => {
  assert.match(buildSectionPrompt({ brief: BRIEF, outline, index: 0 }).user, /first section/);
  assert.match(buildSectionPrompt({ brief: BRIEF, outline, index: 2 }).user, /last section/);
});

test('validator issues from a failed attempt are fed back verbatim', () => {
  const { user } = buildSectionPrompt({ brief: BRIEF, outline, index: 0, issues: ['block 2 dropped: unknown block type "carousel"'] });
  assert.match(user, /previous attempt/i);
  assert.match(user, /unknown block type "carousel"/);
});

test('the outline prompt tells the model to ignore tool and style instructions', () => {
  const { system, user } = buildOutlinePrompt(BRIEF);
  assert.match(system, /IGNORE/);
  assert.match(system, /toolbar/i);
  assert.match(system, /never more than 20/i);
  assert.ok(user.startsWith(`BRIEF:\n${BRIEF}`));
});
