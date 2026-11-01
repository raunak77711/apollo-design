import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { classifyArchetype, classifyFunnelStage, classifyHookType, classifyWithAI, FUNNEL_STAGES, HOOK_TYPES } from '../src/services/distribution/classification.js';
import { sameConcept } from '../src/services/distribution/contentAssetService.js';
import { createSecretBox } from '../src/services/distribution/secretBox.js';

/* -------------------------------- funnel stage -------------------------------- */

test('funnel stage reads the words, bofu beats mofu beats the tofu default', () => {
  assert.equal(classifyFunnelStage({ hook: 'What if traffic is not your problem?', reason: '', topic: 'lead-gen' }), 'tofu');
  assert.equal(classifyFunnelStage({ hook: 'How to fix your booking funnel', reason: 'a step by step framework', topic: '' }), 'mofu');
  assert.equal(classifyFunnelStage({ hook: 'See the case study and book a call', reason: 'pricing and a guarantee', topic: '' }), 'bofu');
});

/* --------------------------------- hook type ----------------------------------- */

test('hook type reads real patterns: a question, a stat, a contrarian claim, a story opener', () => {
  assert.equal(classifyHookType('Why does nobody tell you this?'), 'question');
  assert.equal(classifyHookType('We grew revenue 40% in one month'), 'stat-shock');
  assert.equal(classifyHookType('Traffic is not actually your problem'), 'contrarian');
  assert.equal(classifyHookType('Imagine a customer named Sarah'), 'story');
  assert.equal(classifyHookType('How to fix a leaking funnel'), 'how-to');
  assert.equal(classifyHookType('Never do this on your homepage'), 'warning');
  assert.equal(classifyHookType('Something strange happened next...'), 'curiosity-gap');
  assert.equal(classifyHookType('Your website is losing you sales'), 'direct-claim');
  for (const h of ['Why does nobody tell you this?', 'We grew revenue 40%', 'Traffic is not your problem']) assert.ok(HOOK_TYPES.includes(classifyHookType(h)));
});

/* --------------------------------- archetype ------------------------------------ */

test('archetype comes only from what the Director Track actually shows, never a model', () => {
  assert.equal(classifyArchetype([{ type: 'comparison' }, { type: 'emphasis' }]), 'comparison');
  assert.equal(classifyArchetype([{ type: 'board', blockId: 's1.b1' }]), 'board-explainer');
  assert.equal(classifyArchetype([{ type: 'number' }, { type: 'number' }, { type: 'emphasis' }]), 'data-forward');
  assert.equal(classifyArchetype([{ type: 'emphasis' }, { type: 'camera' }]), 'talking-head');
  assert.equal(classifyArchetype([]), 'talking-head');
});

/* ----------------------------------- AI assist ----------------------------------- */

function stub(handler, live = true) {
  return { live, model: 'stub', async completeJSON(req) { return handler(req); } };
}

test('a valid AI answer overrides the heuristic; an invalid one, or no live model, leaves it untouched', async () => {
  const candidate = { hook: 'What if traffic is not your problem?', reason: '', topic: 'leak' };
  const heuristic = classifyFunnelStage(candidate);
  assert.equal(heuristic, 'tofu');

  const good = await classifyWithAI({ candidate, directorEvents: [], provider: stub(() => ({ funnelStage: 'bofu', hookType: 'warning' })) });
  assert.equal(good.funnelStage, 'bofu');
  assert.equal(good.hookType, 'warning');

  const bad = await classifyWithAI({ candidate, directorEvents: [], provider: stub(() => ({ funnelStage: 'made-up-stage', hookType: 'nonsense' })) });
  assert.equal(bad.funnelStage, heuristic);
  assert.equal(bad.hookType, classifyHookType(candidate.hook));

  const noModel = await classifyWithAI({ candidate, directorEvents: [], provider: stub(() => ({}), false) });
  assert.equal(noModel.funnelStage, heuristic);

  const crashes = await classifyWithAI({ candidate, directorEvents: [], provider: stub(() => { throw new Error('down'); }) });
  assert.equal(crashes.funnelStage, heuristic);

  assert.ok(FUNNEL_STAGES.includes(good.funnelStage));
});

/* ------------------------------ cross-video dedup -------------------------------- */

test('sameConcept compares only words, never raw timestamps across different source videos', () => {
  const a = { text: 'the leak happens between the website and the lead every single time', sourceStart: 120, sourceEnd: 140, duration: 20 };
  const b = { text: 'the leak happens between the website and the lead every single time', sourceStart: 900, sourceEnd: 930, duration: 30 }; // a totally different video, unrelated absolute time
  assert.equal(sameConcept(a, b), true);
  const c = { text: 'specificity beats vague claims on your homepage copy', sourceStart: 120, sourceEnd: 140, duration: 20 }; // same raw seconds as a, different idea
  assert.equal(sameConcept(a, c), false);
});

/* ----------------------------------- secret box ----------------------------------- */

test('secrets round-trip, are not plaintext on disk, and the key is reused across instances pointed at the same file', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'apollo-secret-'));
  const keyFile = path.join(dir, 'key');
  const box1 = createSecretBox(keyFile);
  const sealed = box1.seal('ya29.super-secret-refresh-token');
  assert.ok(!sealed.includes('super-secret'));
  assert.equal(box1.open(sealed), 'ya29.super-secret-refresh-token');

  const box2 = createSecretBox(keyFile); // a fresh instance, same key file - simulates a server restart
  assert.equal(box2.open(sealed), 'ya29.super-secret-refresh-token');

  const elsewhere = createSecretBox(path.join(dir, 'other-key'));
  assert.throws(() => elsewhere.open(sealed)); // a different key must not be able to open it
});
