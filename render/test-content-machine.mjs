// Actual HTML render smoke test. Requires the host worker (node render/worker.mjs).
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createCombinatorMotion } from '../server/src/services/combinatorMotion.js';
import { probe } from '../server/src/services/combinator.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = await fs.mkdtemp(path.join(repo, 'server/storage/motion-check-'));
const ff = promisify(execFile);
try {
  const source = path.join(dir, 'source.mp4'), output = path.join(dir, 'rendered.mp4');
  await ff('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x568:r=30:d=2', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ac', '2', '-video_track_timescale', '15360', source], { windowsHide: true });
  const motion = createCombinatorMotion();
  const status = await motion.status();
  assert.equal(status.available, true, status.reason);
  await motion.render(source, output, { width: 320, height: 568, duration: 2, subtitlePosition: 'lower', events: [{ start: .2, end: 1.7, type: 'underline', text: 'Useful idea' }] });
  const info = await probe(output);
  assert.equal(info.audio, true);
  assert.ok(Math.abs(info.duration - 2) < .15);
  const energy = async time => {
    const { stdout } = await ff('ffmpeg', ['-v', 'error', '-ss', String(time), '-i', output, '-vf', 'crop=320:160:0:60,format=gray', '-frames:v', '1', '-f', 'rawvideo', '-'], { encoding: 'buffer', windowsHide: true });
    return stdout.reduce((sum, value) => sum + value, 0);
  };
  const before = await energy(.1), entering = await energy(.233), shown = await energy(.7), after = await energy(1.9);
  assert.ok(shown > before + 1000, 'HTML text should appear in encoded frames');
  assert.ok(shown > entering * 1.5, 'HTML animation must fade in over time');
  assert.ok(shown > after + 1000, 'HTML text should leave at its planned end');
  const artifacts = path.join(repo, 'render/artifacts');
  await fs.mkdir(artifacts, { recursive: true });
  await ff('ffmpeg', ['-y', '-v', 'error', '-ss', '0.7', '-i', output, '-frames:v', '1', path.join(artifacts, 'content-machine-motion.png')], { windowsHide: true });
  console.log('HTML animation smoke test passed: visible animated frames, cue timing, audio and duration.');
} finally { await fs.rm(dir, { recursive: true, force: true }); }
