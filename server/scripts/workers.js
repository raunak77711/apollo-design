#!/usr/bin/env node
/**
 * Start everything the Content Factory needs on this computer, in one terminal:
 *   - the Whisper worker  (transcription, face finding, preview copies)  :5011
 *   - the render worker   (the finished videos)                          :5012
 *
 *   npm run workers --prefix server        (or double-click start-workers.bat in the repo root)
 *
 * Each is restarted if it crashes. Ctrl+C stops both.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const jobs = [
  { name: 'whisper', script: path.join(here, 'whisper-worker.js') },
  { name: 'render ', script: path.resolve(here, '../../render/worker.mjs') },
];
let stopping = false;
const children = new Set();

function launch({ name, script }) {
  const child = spawn(process.execPath, [script], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  children.add(child);
  const tag = (d) => String(d).split(/\r?\n/).filter(Boolean).forEach((l) => console.log(`[${name}] ${l}`));
  child.stdout.on('data', tag);
  child.stderr.on('data', tag);
  child.on('exit', (code) => {
    children.delete(child);
    if (stopping) return;
    console.log(`[${name}] stopped (code ${code}); restarting in 3s`);
    setTimeout(() => launch({ name, script }), 3000);
  });
}

jobs.forEach(launch);
const stop = () => { stopping = true; children.forEach((c) => c.kill()); setTimeout(() => process.exit(0), 500); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
console.log('Content Factory workers starting. Leave this window open. Ctrl+C stops them.');
