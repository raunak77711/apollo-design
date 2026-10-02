#!/usr/bin/env node
/**
 * Transcribe a video with Apollo's local Whisper, using the transcript cache.
 *
 *   node scripts/transcribe.js <video> [--force] [--out transcript.json] [--json]
 *
 * Prints a summary (or the transcript itself with --json). The second run on the
 * same video is answered from cache; --force transcribes again.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { getTranscriptionService } from '../src/services/transcription/transcriptionService.js';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const valueOf = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const video = args.find((a) => !a.startsWith('--') && a !== valueOf('--out'));

if (!video) {
  console.error('usage: node scripts/transcribe.js <video> [--force] [--out transcript.json] [--json]');
  process.exit(1);
}

const service = getTranscriptionService();
const status = await service.status();
if (!status.available && !flag('--force')) {
  // A cached transcript is still answerable without Whisper; only warn.
  console.error(`[transcribe] Whisper unavailable: ${status.reason || 'unknown'}`);
}

const started = Date.now();
let lastShown = -1;
try {
  const result = await service.transcribeVideo(video, {
    force: flag('--force'),
    onStage: (stage) => console.error(`[transcribe] ${stage}...`),
    onProgress: (p) => {
      const pct = Math.floor(p * 100);
      if (pct >= lastShown + 10) {
        lastShown = pct;
        console.error(`[transcribe] ${pct}%`);
      }
    },
  });
  const { transcript } = result;
  const words = transcript.segments.reduce((n, s) => n + s.words.length, 0);
  const seconds = (Date.now() - started) / 1000;

  if (valueOf('--out')) await fs.writeFile(valueOf('--out'), JSON.stringify(transcript, null, 2));
  if (flag('--json')) {
    console.log(JSON.stringify(transcript, null, 2));
  } else {
    console.log(`video        ${path.resolve(video)}`);
    console.log(`sha256       ${result.sourceHash}`);
    console.log(`source       ${result.cached ? 'CACHE (Whisper not run)' : 'transcribed now'}`);
    console.log(`transcript   ${service.cache.pathFor(result.sourceHash)}`);
    console.log(`duration     ${transcript.duration}s, ${transcript.segments.length} segments, ${words} words`);
    if (transcript.meta) {
      const m = transcript.meta;
      console.log(`engine       ${m.model} on ${m.device} (${m.computeType})${m.gpuFallback ? ' - GPU failed, fell back to CPU' : ''}`);
      console.log(`whisper time ${m.transcribeSeconds}s (${m.realtimeFactor}x real time)`);
    }
    console.log(`wall time    ${seconds.toFixed(1)}s`);
  }
} catch (err) {
  console.error(`[transcribe] failed: ${err.message}`);
  process.exit(2);
}
