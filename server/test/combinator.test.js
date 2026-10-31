import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { combinationAt, mixedCombinationIndices, normalizeClip, probe, renderCombination, fingerprintAudio } from '../src/services/combinator.js';
import { captionCues, makeAss, makeSrt, polishCaptions } from '../src/services/combinatorCaptions.js';

test('mixed selection covers the entire pool without repeats and supports lazy large pools', () => {
  for (const total of [1, 7, 125, 12500]) {
    const indices = [...mixedCombinationIndices(total, limit => Math.floor(limit / 2))];
    assert.equal(new Set(indices).size, total);
    assert.ok(indices.every(i => i >= 0 && i < total));
    if (total > 1) assert.notEqual(indices[0], 0);
  }
  const pool = mixedCombinationIndices(Number.MAX_SAFE_INTEGER, () => 0);
  assert.equal(pool.next().value, 0);
  assert.equal(pool.next().value, Number.MAX_SAFE_INTEGER - 1);
});

test('enumerates every combination once, including arbitrary unequal counts', () => {
  for (const counts of [[5, 5, 5], [2, 3, 7], [1, 1, 1], [0, 3, 2]]) {
    const groups = Object.fromEntries(['hooks', 'bodies', 'ctas'].map((key, i) => [key, Array.from({ length: counts[i] }, (_, n) => `${key}-${n}`)]));
    const total = counts.reduce((a, b) => a * b, 1);
    const seen = new Set();
    for (let i = 0; i < total; i++) seen.add(combinationAt(groups, i).join('/'));
    assert.equal(seen.size, total);
    assert.throws(() => combinationAt(groups, total));
  }
});

test('DeepSeek cleanup preserves timing and rejects incomplete output', async () => {
  const input = [{ start: .2, end: 1.3, text: 'hello there' }];
  const polished = await polishCaptions(input, { chat: async () => ({ segments: [{ id: 0, text: 'Hello there.' }] }) });
  assert.deepEqual(polished, [{ start: .2, end: 1.3, text: 'Hello there.' }]);
  assert.match(makeSrt(polished), /00:00:00,200 --> 00:00:01,300\nHello there\./);
  await assert.rejects(() => polishCaptions(input, { chat: async () => ({ segments: [] }) }), /incomplete/);
});

test('noise cancellation reduces background noise in an actual audio export', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'apollo-denoise-'));
  const exec = promisify(execFile);
  try {
    const input = path.join(dir, 'noise.wav');
    await exec('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'anoisesrc=color=white:amplitude=0.005:seed=42:r=48000:d=2', input]);
    const media = await probe(input);
    const energy = async file => {
      const { stdout } = await exec('ffmpeg', ['-v', 'error', '-ss', '0.5', '-i', file, '-vn', '-ac', '1', '-f', 'f32le', '-'], { encoding: 'buffer' });
      let sum = 0;
      for (let i = 0; i < stdout.length; i += 4) sum += stdout.readFloatLE(i) ** 2;
      return sum / (stdout.length / 4);
    };
    const original = path.join(dir, 'original.mp4'), cleaned = path.join(dir, 'cleaned.mp4');
    await normalizeClip(input, original, media, 160, 160);
    await normalizeClip(input, cleaned, media, 160, 160, { noiseCancellation: true });
    assert.ok(await energy(cleaned) < await energy(original) * .8, 'Noise energy should decrease');
    const result = await probe(cleaned);
    assert.equal(result.audio, true);
    assert.ok(Math.abs(result.duration - media.duration) < .15);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('subtitles stay in readable phrases with speech word timings', () => {
  const words = 'one two three four five six seven eight'.split(' ').map((word, i) => ({ word, start: i, end: i + .8 }));
  const cues = captionCues([{ start: 0, end: 8, text: words.map(w => w.word).join(' '), words }]);
  assert.equal(cues.length, 2);
  assert.deepEqual(cues[0], { start: 0, end: 5.8, text: 'one two three four five six' });
  assert.equal(cues[1].start, 6);
});

test('exports actual subtitles and a CTA that fades from transparent to opaque', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'apollo-cta-'));
  const exec = promisify(execFile);
  try {
    const input = path.join(dir, 'source.mp4'), output = path.join(dir, 'output.mp4'), assFile = path.join(dir, 'captions.ass');
    await exec(process.env.FFMPEG_PATH || 'ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x320:r=30', '-t', '2', '-c:v', 'libx264', input]);
    await fs.writeFile(assFile, makeAss({ width: 320, height: 320, duration: 2, segments: [{ start: 0, end: .7, text: 'Readable subtitles' }], overlay: { enabled: true, type: 'email', value: 'hello@example.com', fade: true, fadeSeconds: 1 } }));
    await normalizeClip(input, output, await probe(input), 320, 320, { assFile });
    const frame = async (time, crop) => {
      const { stdout } = await exec(process.env.FFMPEG_PATH || 'ffmpeg', ['-v', 'error', '-ss', String(time), '-i', output, '-vf', `crop=${crop},format=gray`, '-frames:v', '1', '-f', 'rawvideo', '-'], { encoding: 'buffer', maxBuffer: 1024 ** 2 });
      return stdout.reduce((sum, value) => sum + value, 0);
    };
    const earlyCTA = await frame(.033, '320:120:0:70'), lateCTA = await frame(1.5, '320:120:0:70');
    assert.ok(lateCTA > earlyCTA * 3, `${earlyCTA} -> ${lateCTA}`);
    const withCaptions = await frame(.2, '320:80:0:240'), withoutCaptions = await frame(1.5, '320:80:0:240');
    assert.ok(withCaptions > withoutCaptions + 1000, `${withCaptions} vs ${withoutCaptions}`);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('normalizes silent video and audio-only inputs and exports a playable concatenation', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'apollo-combinator-'));
  const exec = promisify(execFile);
  try {
    await exec(process.env.FFMPEG_PATH || 'ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=160x90:r=24', '-t', '0.5', '-c:v', 'libx264', path.join(dir, 'silent.mp4')]);
    await exec(process.env.FFMPEG_PATH || 'ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '0.5', path.join(dir, 'audio.wav')]);
    for (const [input, output] of [['silent.mp4', 'a.mp4'], ['audio.wav', 'b.mp4']]) {
      const media = await probe(path.join(dir, input));
      await normalizeClip(path.join(dir, input), path.join(dir, output), media, 160, 160);
      const result = await probe(path.join(dir, output));
      assert.equal(result.video, true); assert.equal(result.audio, true);
    }
    const output = path.join(dir, 'result.mp4');
    await renderCombination(['a.mp4', 'b.mp4', 'a.mp4'].map(f => path.join(dir, f)), output, path.join(dir, 'concat.txt'));
    const result = await probe(output);
    assert.equal(result.video, true); assert.equal(result.audio, true);
    assert.ok(result.duration >= 1.4 && result.duration < 2, String(result.duration));
    await exec(process.env.FFMPEG_PATH || 'ffmpeg', ['-v', 'error', '-i', output, '-f', 'null', '-']);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('portrait fill has square pixels and no added pillarbox bars', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'apollo-fill-')), exec = promisify(execFile);
  try {
    const input = path.join(dir, 'tall.mp4'), output = path.join(dir, 'filled.mp4');
    await exec('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=160x350:r=30:d=0.5', '-c:v', 'libx264', input]);
    await normalizeClip(input, output, await probe(input), 180, 320, { fit: 'cover' });
    const { stdout } = await exec('ffmpeg', ['-v', 'error', '-i', output, '-vf', 'crop=2:2:0:100,format=rgb24', '-frames:v', '1', '-f', 'rawvideo', '-'], { encoding: 'buffer' });
    assert.ok(stdout[2] > 150 && stdout[0] < 30, 'Left edge must contain footage rather than a black border');
    const info = await probe(output); assert.equal(info.width, 180); assert.equal(info.height, 320);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('audio identity ignores filename/container metadata and ignores silence', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'apollo-audio-identity-')), exec = promisify(execFile);
  try {
    const a = path.join(dir, 'one.mp3'), b = path.join(dir, 'two.mp3'), silence = path.join(dir, 'silent.wav');
    await exec('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.5', a]);
    await exec('ffmpeg', ['-y', '-v', 'error', '-i', a, '-c', 'copy', '-metadata', 'title=Different name', b]);
    assert.equal(await fingerprintAudio(a), await fingerprintAudio(b));
    await exec('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=16000:cl=mono', '-t', '0.5', silence]);
    assert.equal(await fingerprintAudio(silence), null);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
