import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { createCombinatorRouter } from '../src/routes/combinator.js';
import { combinationAt } from '../src/services/combinator.js';

const fakeMedia = {
  probe: async () => ({ duration: 1, video: true, audio: false }),
  normalizeClip: async (_input, output) => fs.writeFile(output, 'prepared'),
  renderCombination: async (_inputs, output) => fs.writeFile(output, 'video'),
};
async function fixture(fn, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'apollo-batches-'));
  const servers = [];
  const start = async () => {
    const app = express(); app.use(express.json());
    app.use('/api/combinator', createCombinatorRouter({ root, media: fakeMedia, ai: null, transcription: { status: async () => ({ available: false }) }, ...options }));
    const server = app.listen(0); await new Promise(resolve => server.once('listening', resolve)); servers.push(server);
    const base = `http://127.0.0.1:${server.address().port}/api/combinator`;
    const post = (url, body) => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const wait = async id => {
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        const job = await (await fetch(`${base}/jobs/${id}`)).json();
        if (['complete', 'failed'].includes(job.status)) return job;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      throw new Error('Batch did not finish');
    };
    return { base, post, wait };
  };
  const seed = async (counts = [5, 5, 5]) => {
    await fs.mkdir(path.join(root, 'uploads'), { recursive: true });
    const groups = {};
    for (const [i, role] of ['hooks', 'bodies', 'ctas'].entries()) {
      groups[role] = [];
      for (let n = 0; n < counts[i]; n++) {
        const id = randomUUID(); groups[role].push(id);
        await fs.writeFile(path.join(root, 'uploads', `${id}.json`), JSON.stringify({ id, name: `${role}-${n}.mp4`, sha256: createHash('sha256').update(`${role}-${n}`).digest('hex'), duration: 1, video: true, audio: false }));
      }
    }
    return groups;
  };
  try { await fn({ root, start, seed }); }
  finally {
    for (const server of servers) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await fs.rm(root, { recursive: true, force: true });
  }
}

test('concurrent batches of 25 and 100 reserve all 125 combinations without overlap', () => fixture(async ({ root, seed, start }) => {
  const groups = await seed(), { base, post, wait } = await start();
  const responses = await Promise.all([25, 100].map(batchSize => post('/jobs', { groups, batchSize, format: 'square' })));
  assert.deepEqual(responses.map(r => r.status), [202, 202]);
  const jobs = await Promise.all(responses.map(r => r.json()));
  assert.deepEqual(jobs.map(j => j.total).sort((a,b) => a-b), [25, 100]);
  const records = await Promise.all(jobs.map(j => fs.readFile(path.join(root, j.id, 'job.json'), 'utf8').then(JSON.parse)));
  const keys = records.flatMap(j => j.selection.map(s => s.key));
  assert.equal(keys.length, 125); assert.equal(new Set(keys).size, 125);
  assert.equal((await post('/jobs', { groups, batchSize: 25 })).status, 409);
  for (const job of jobs) { const result = await wait(job.id); assert.equal(result.status, 'complete', result.error); }
  assert.deepEqual(await (await post('/availability', { groups })).json(), { possible: 125, remaining: 0 });
  const archive = await fetch(`${base}/jobs/${jobs[0].id}/archive`);
  assert.equal(archive.status, 200);
  const zip = Buffer.from(await archive.arrayBuffer());
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.ok(zip.includes(Buffer.from('video-0025.mp4')));
  assert.ok(zip.includes(Buffer.from('manifest.json')));
  assert.equal((await (await fetch(`${base}/jobs/${jobs[1].id}?offset=30`)).json()).results[0].number, 31);
}));

test('library branches persist separately, restore settings and keep batch uniqueness across forks', () => fixture(async ({ root, seed, start }) => {
  const groups = await seed([3, 2, 2]), first = await start();
  for (const id of Object.values(groups).flat()) await fs.writeFile(path.join(root, 'uploads', id), 'source-video');
  const settings = { format: 'square', batchSize: 3, subtitles: false, noiseCancellation: true, overlay: { enabled: true, type: 'dm', value: '', fade: true, fadeSeconds: 1 } };
  const response = await first.post('/projects', { name: 'Monday', groups, settings });
  assert.equal(response.status, 201);
  const monday = await response.json();
  assert.equal(monday.groups.hooks.length, 3);
  const job = await (await first.post('/jobs', { groups, projectId: monday.id, batchSize: 3 })).json();
  assert.equal(job.projectId, monday.id);
  assert.equal((await first.wait(job.id)).completed, 3);
  const fork = await (await first.post('/projects', { name: 'Tuesday', parentId: monday.id, groups, settings })).json();
  const next = await (await first.post('/jobs', { groups, projectId: fork.id, batchSize: 3 })).json();
  assert.equal((await first.wait(next.id)).completed, 3);
  const records = await Promise.all([job, next].map(j => fs.readFile(path.join(root, j.id, 'job.json'), 'utf8').then(JSON.parse)));
  assert.equal(new Set(records.flatMap(r => r.selection.map(s => s.key))).size, 6);
  const empty = { hooks: [], bodies: [], ctas: [] };
  const update = await fetch(`${first.base}/projects/${fork.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Tuesday updated', groups: empty, settings }) });
  assert.equal(update.status, 200);
  const second = await start();
  const library = await (await fetch(`${second.base}/projects`)).json();
  const restored = library.find(p => p.id === monday.id), changed = library.find(p => p.id === fork.id);
  assert.equal(restored.groups.hooks.length, 3);
  assert.deepEqual(restored.settings, settings);
  assert.deepEqual(changed.groups, empty);
  assert.equal(changed.parentId, monday.id);
  const zip = Buffer.from(await (await fetch(`${second.base}/projects/${monday.id}/archive`)).arrayBuffer());
  for (const name of ['hooks/', 'bodies/', 'ctas/', 'branch.json', 'source-video']) assert.ok(zip.includes(Buffer.from(name)));
  assert.equal((await second.post('/projects', { name: '', groups })).status, 400);
  assert.equal((await second.post('/projects', { name: 'Bad', groups: { ...groups, hooks: ['../bad'] } })).status, 400);
  assert.equal((await second.post('/jobs', { projectId: randomUUID(), groups })).status, 400);
}));

test('history survives restart, reordering and renamed copies of identical source bytes', () => fixture(async ({ root, seed, start }) => {
  const groups = await seed([2, 2, 2]), first = await start();
  const created = await (await first.post('/jobs', { groups, batchSize: 3 })).json();
  const initial = await first.wait(created.id); assert.equal(initial.completed, 3, initial.error);
  // New router instance simulates reading durable records after a restart.
  const second = await start();
  const renamed = {};
  for (const role of ['hooks', 'bodies', 'ctas']) {
    renamed[role] = [];
    for (const oldId of [...groups[role]].reverse()) {
      const clip = JSON.parse(await fs.readFile(path.join(root, 'uploads', `${oldId}.json`), 'utf8'));
      const id = randomUUID(); renamed[role].push(id);
      await fs.writeFile(path.join(root, 'uploads', `${id}.json`), JSON.stringify({ ...clip, id, name: 'renamed.mp4' }));
    }
  }
  assert.deepEqual(await (await second.post('/availability', { groups: renamed })).json(), { possible: 8, remaining: 5 });
  const next = await (await second.post('/jobs', { groups: renamed, batchSize: 100 })).json();
  assert.equal(next.total, 5);
  const completed = await second.wait(next.id); assert.equal(completed.status, 'complete', completed.error);
  const records = await Promise.all([created, next].map(j => fs.readFile(path.join(root, j.id, 'job.json'), 'utf8').then(JSON.parse)));
  assert.equal(new Set(records.flatMap(j => j.selection.map(s => s.key))).size, 8);
}));

test('improving an existing batch preserves exact selections, originals and no-repeat history', async () => {
  let rendered = 0;
  await fixture(async ({ root, seed, start }) => {
    const groups = await seed([2, 1, 1]);
    for (const id of Object.values(groups).flat()) {
      const file = path.join(root, 'uploads', `${id}.json`), clip = JSON.parse(await fs.readFile(file, 'utf8'));
      await fs.writeFile(file, JSON.stringify({ ...clip, audio: true }));
    }
    const { post, wait } = await start();
    const original = await (await post('/jobs', { groups, batchSize: 2 })).json();
    assert.equal((await wait(original.id)).status, 'complete');
    const originalRecord = await fs.readFile(path.join(root, original.id, 'job.json'), 'utf8');
    for (let n = 0; n < 2; n++) {
      const response = await post(`/jobs/${original.id}/refinish`, { animations: true, subtitles: true, cleanup: false, editingRules: { subtitlePosition: 'upper', maxWords: 3 } });
      assert.equal(response.status, 202);
      const improved = await response.json();
      assert.equal(improved.refinementOf, original.id);
      assert.equal((await wait(improved.id)).status, 'complete');
      const record = JSON.parse(await fs.readFile(path.join(root, improved.id, 'job.json'), 'utf8'));
      assert.deepEqual(record.selection, JSON.parse(originalRecord).selection);
      assert.equal(record.editingRules.subtitlePosition, 'upper');
    }
    assert.equal(rendered, 4, 'Repeated improvements reuse rendered clip animations');
    assert.equal(await fs.readFile(path.join(root, original.id, 'job.json'), 'utf8'), originalRecord);
    assert.deepEqual(await (await post('/availability', { groups })).json(), { possible: 2, remaining: 0 });
    assert.equal((await post('/jobs', { groups, batchSize: 1 })).status, 409);
    assert.equal((await post('/jobs', { groups, editingRules: { maxWords: -1 } })).status, 400);
  }, {
    transcription: { status: async () => ({ available: true }), transcribeVideo: async () => ({ transcript: { segments: [{ start: 0, end: .9, text: 'Useful spoken phrase' }] } }) },
    ai: { model: 'test', chat: async () => ({ events: [{ cueId: 0, type: 'keyword', text: 'Useful' }] }) },
    motion: { status: async () => ({ available: true }), render: async (_input, output, props, onProgress) => { rendered++; assert.equal(props.subtitlePosition, 'upper'); await onProgress({ stage: 'rendering HTML', progress: .5 }); await fs.writeFile(output, 'animated video'); } },
  });
});

test('interrupted batches retain completed combinations and release unfinished reservations', () => fixture(async ({ root, seed, start }) => {
  const groups = await seed([2, 1, 1]), { post, wait } = await start();
  const id = randomUUID(), clips = {};
  for (const clipId of Object.values(groups).flat()) clips[clipId] = JSON.parse(await fs.readFile(path.join(root, 'uploads', `${clipId}.json`), 'utf8'));
  await fs.mkdir(path.join(root, id));
  // Legacy interrupted record, with one of two videos durably completed.
  await fs.writeFile(path.join(root, id, 'job.json'), JSON.stringify({ id, groups, clips, total: 2, completed: 1, status: 'rendering', createdAt: new Date().toISOString() }));
  const next = await (await post('/jobs', { groups, batchSize: 2 })).json();
  assert.equal(next.total, 1);
  const completed = await wait(next.id); assert.equal(completed.status, 'complete', completed.error);
  const record = JSON.parse(await fs.readFile(path.join(root, next.id, 'job.json'), 'utf8'));
  assert.equal(record.selection[0].index, 1);
}));

test('custom 40/100 batches from 50 hooks, 50 bodies and 5 CTAs never overlap', () => fixture(async ({ root, seed, start }) => {
  const groups = await seed([50, 50, 5]), { post, wait } = await start();
  const keys = [];
  for (const batchSize of [40, 100]) {
    const response = await post('/jobs', { groups, batchSize, overlay: { enabled: true, type: 'dm', value: '', fade: true, fadeSeconds: 1 } });
    assert.equal(response.status, 202);
    const job = await response.json();
    assert.equal(job.total, batchSize);
    const completed = await wait(job.id);
    assert.equal(completed.status, 'complete', completed.error);
    const record = JSON.parse(await fs.readFile(path.join(root, job.id, 'job.json'), 'utf8'));
    const combinations = record.selection.map(s => combinationAt(record.groups, s.index));
    if (batchSize === 40) assert.equal(new Set(combinations.map(c => c[0])).size, 40, 'Use distinct hooks before repeating any hook');
    for (let i = 1; i < combinations.length; i++) assert.notEqual(combinations[i][1], combinations[i - 1][1], 'Alternate bodies when unused combinations permit');
    keys.push(...record.selection.map(s => s.key));
  }
  assert.equal(new Set(keys).size, 140);
  assert.deepEqual(await (await post('/availability', { groups })).json(), { possible: 12500, remaining: 12360 });
}));

test('different hook filenames with identical audio do not count as fresh spoken hooks', () => fixture(async ({ root, seed, start }) => {
  const groups = await seed([3, 2, 2]);
  for (const id of groups.hooks) {
    const file = path.join(root, 'uploads', `${id}.json`), clip = JSON.parse(await fs.readFile(file, 'utf8'));
    await fs.writeFile(file, JSON.stringify({ ...clip, audio: true, audioIdentity: 'identical-speech', audioIdentityVersion: 1 }));
  }
  const { post, wait } = await start();
  const available = await (await post('/availability', { groups })).json();
  assert.equal(available.possible, 4); assert.equal(available.hookAudit.distinct, 1); assert.equal(available.hookAudit.imported, 3);
  const original = await (await post('/jobs', { groups, batchSize: 4, faceAware: false })).json();
  const completed = await wait(original.id); assert.equal(completed.status, 'complete'); assert.equal(completed.freshness.distinctHooks, 1);
  const renamed = { ...groups, hooks: [...groups.hooks].reverse() };
  assert.equal((await (await post('/availability', { groups: renamed })).json()).remaining, 0);
  assert.equal((await post('/jobs', { groups: renamed, batchSize: 25 })).status, 409);
  const previewResponse = await post(`/jobs/${original.id}/refinish`, { previewOnly: true, faceAware: false });
  assert.equal(previewResponse.status, 202);
  const preview = await previewResponse.json(); assert.equal(preview.total, 1); assert.equal(preview.previewOnly, true); assert.equal((await wait(preview.id)).status, 'complete');
}));

test('arbitrary counts and duplicate sources are validated without fixed clip limits', () => fixture(async ({ seed, start }) => {
  const groups = await seed([50, 25, 7]), { post, wait } = await start();
  groups.hooks.push(groups.hooks[0]);
  assert.deepEqual(await (await post('/availability', { groups })).json(), { possible: 8750, remaining: 8750 });
  for (const batchSize of [0, -1, 1.5, '25']) assert.equal((await post('/jobs', { groups, batchSize })).status, 400);
  assert.equal((await post('/jobs', { groups, subtitles: true })).status, 503);
  assert.equal((await post('/suggest-cta', { type: 'email', value: 'hello@example.com' })).status, 503);
  const created = await (await post('/jobs', { groups, batchSize: 25 })).json();
  assert.equal(created.total, 25); const completed = await wait(created.id); assert.equal(completed.status, 'complete', completed.error);
}));

test('subtitles use speech timings, DeepSeek cleanup, role-specific overlays and cached text', async () => {
  let transcriptionCalls = 0, aiCalls = 0;
  const scripts = [];
  await fixture(async ({ root, seed, start }) => {
    const groups = await seed([1, 2, 1]);
    for (const id of Object.values(groups).flat()) {
      const file = path.join(root, 'uploads', `${id}.json`), clip = JSON.parse(await fs.readFile(file, 'utf8'));
      await fs.writeFile(file, JSON.stringify({ ...clip, audio: true }));
    }
    const { base, post, wait } = await start();
    const overlay = { enabled: true, type: 'website', value: 'example.com', heading: 'Visit us', fade: true, fadeSeconds: .8 };
    const suggested = await (await post('/suggest-cta', { type: 'email', value: 'hello@example.com' })).json();
    assert.equal(suggested.heading, 'Keep in touch');
    for (let n = 0; n < 2; n++) {
      const created = await (await post('/jobs', { groups, batchSize: 1, subtitles: true, cleanup: true, overlay })).json();
      const job = await wait(created.id);
      assert.equal(job.status, 'complete', job.error);
      const srt = await (await fetch(`http://127.0.0.1:${new URL(base).port}${job.results[0].subtitleUrl}`)).text();
      assert.match(srt, /Hello there\./);
      assert.match(srt, /00:00:02,100 --> 00:00:02,900/);
    }
    assert.equal(transcriptionCalls, 4, 'Each source transcribed once across batches');
    assert.equal(aiCalls, 5, 'One CTA suggestion and four caption cleanups');
    assert.ok(scripts.some(s => s.file.includes('-ctas.ass') && s.text.includes('\\fad(800,0)') && s.text.includes('example.com')));
    assert.ok(scripts.filter(s => !s.file.includes('-ctas.ass')).every(s => !s.text.includes('example.com')));
  }, {
    transcription: { status: async () => ({ available: true }), transcribeVideo: async () => { transcriptionCalls++; return { transcript: { segments: [{ start: .1, end: .9, text: 'hello there' }] } }; } },
    ai: { model: 'test', chat: async ({ user }) => { aiCalls++; const input = JSON.parse(user); return input.segments ? { segments: input.segments.map(s => ({ ...s, text: 'Hello there.' })) } : { heading: 'Keep in touch' }; } },
    media: { ...fakeMedia, normalizeClip: async (_input, output, _clip, _w, _h, { assFile }) => { if (assFile) scripts.push({ file: assFile, text: await fs.readFile(assFile, 'utf8') }); await fs.writeFile(output, 'prepared'); } },
  });
});
