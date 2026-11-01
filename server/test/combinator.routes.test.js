import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createCombinatorRouter } from '../src/routes/combinator.js';

test('uploads, validates, queues, renders, paginates and downloads a batch', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'apollo-combinator-api-'));
  const app = express();
  app.use(express.json());
  app.use('/api/combinator', createCombinatorRouter({ root }));
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/combinator`;
  const post = (url, body) => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    assert.equal((await post('/jobs', { groups: { hooks: [], bodies: [], ctas: [] } })).status, 400);
    assert.equal((await fetch(base + '/jobs/not-an-id')).status, 404);
    await promisify(execFile)(process.env.FFMPEG_PATH || 'ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=160x90:r=30', '-t', '0.1', '-c:v', 'libx264', path.join(root, 'source.mp4')]);
    const form = new FormData();
    form.append('file', new Blob([await fs.readFile(path.join(root, 'source.mp4'))]), 'clip.mp4');
    const uploaded = await fetch(base + '/clips', { method: 'POST', body: form });
    assert.equal(uploaded.status, 201);
    const clip = await uploaded.json();
    const response = await post('/jobs', { groups: { hooks: [clip.id], bodies: [clip.id], ctas: [clip.id] }, format: 'square' });
    assert.equal(response.status, 202);
    let job = await response.json();
    const deadline = Date.now() + 20000;
    while (!['complete', 'failed'].includes(job.status) && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 100));
      job = await (await fetch(`${base}/jobs/${job.id}`)).json();
    }
    assert.equal(job.status, 'complete', job.error);
    assert.equal(job.completed, 1);
    assert.deepEqual(job.results[0].names, ['clip.mp4', 'clip.mp4', 'clip.mp4']);
    const download = await fetch(`http://127.0.0.1:${server.address().port}${job.results[0].url}`);
    assert.equal(download.status, 200);
    assert.match(download.headers.get('content-disposition'), /attachment/);
    assert.ok((await download.arrayBuffer()).byteLength > 0);
    assert.equal((await (await fetch(`${base}/jobs/${job.id}?offset=30`)).json()).results.length, 0);
    assert.equal((await fetch(`${base}/jobs/${job.id}/videos/2`)).status, 404);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  }
});
