#!/usr/bin/env node
/**
 * Build a realistic test recording for the Content Factory, with KNOWN mistakes in it.
 *
 *   node scripts/make-test-recording.js [out-dir]
 *
 * Takes the spoken (CAMERA) narration of a script, reads it aloud with Windows' built-in
 * text-to-speech, and plants retakes at known places: announced restarts ("sorry, let me say
 * that again"), silent restarts (a fragment, then the whole line), and an off-topic aside. It writes
 *   <out>/recording.mp4   a 9:16 clip with the speech
 *   <out>/truth.json      exactly which lines were botched, so an analysis can be checked against it
 * Windows only (System.Speech). The voice is synthetic: it proves the pipeline, not Whisper on your voice.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const brief = fs.readFileSync(path.resolve(here, '../test/fixtures/briefLeadsGoBad.md'), 'utf8');
const out = path.resolve(process.argv[2] || path.resolve(here, '../whisper/samples/realistic'));
fs.mkdirSync(out, { recursive: true });

// The CAMERA paragraphs: everything between **CAMERA** and the next canvas/heading/rule.
const camera = [];
let on = false;
for (const raw of brief.split(/\r?\n/)) {
  const line = raw.trim();
  if (line === '**CAMERA**') { on = true; continue; }
  if (line === '**CANVAS**' || line.startsWith('#') || line === '---') { on = false; continue; }
  if (on && line) camera.push(line.replace(/\*\*/g, '').replace(/[“”]/g, '"'));
}

// Merge the short lines into sentences so a "retake" replays a whole thought.
const sentences = [];
let buf = '';
for (const line of camera) {
  buf = `${buf} ${line}`.trim();
  if (/[.?!"]$/.test(line) && buf.split(/\s+/).length >= 7) { sentences.push(buf); buf = ''; }
}
if (buf) sentences.push(buf);

const head = (s, n) => s.split(/\s+/).slice(0, n).join(' ').replace(/[.,?!]+$/, '');
const truth = { announcedRetakes: [], silentRestarts: [], asides: [] };
const script = [];

sentences.forEach((s, i) => {
  const words = s.split(/\s+/).length;
  if (i % 7 === 3 && words >= 8) {
    // "Most businesses, uh, most businesses think, sorry. Let me say that again. <the line>"
    script.push(`${head(s, 3)}, uh, ${head(s, 2)} ${s.split(/\s+/).slice(2, 4).join(' ')}, sorry.`);
    script.push('Let me say that again.');
    script.push(s);
    truth.announcedRetakes.push({ line: s, failed: `${head(s, 3)}, uh, ${head(s, 2)} ...` });
  } else if (i % 7 === 5 && words >= 9) {
    // A silent restart: half the line, then the whole line again, no announcement.
    script.push(`${s.split(/\s+/).slice(0, Math.ceil(words / 2)).join(' ')},`);
    script.push(s);
    truth.silentRestarts.push({ line: s, failed: s.split(/\s+/).slice(0, Math.ceil(words / 2)).join(' ') });
  } else {
    script.push(s);
  }
  if (i === Math.floor(sentences.length / 2)) {
    const aside = 'Okay, quick housekeeping before I go on. If you enjoy these videos, please subscribe, and my cat is walking across my desk again, so ignore the noise.';
    script.push(aside);
    truth.asides.push({ line: aside });
  }
});

fs.writeFileSync(path.join(out, 'script.txt'), script.join('\n\n'), 'utf8');
fs.writeFileSync(path.join(out, 'truth.json'), JSON.stringify({ sentences: sentences.length, ...truth }, null, 2));

const ps = `
Add-Type -AssemblyName System.Speech
$v = New-Object System.Speech.Synthesis.SpeechSynthesizer
$v.Rate = 1
$v.SetOutputToWaveFile('${path.join(out, 'speech.wav').replace(/\\/g, '\\\\')}')
$v.Speak([IO.File]::ReadAllText('${path.join(out, 'script.txt').replace(/\\/g, '\\\\')}', [Text.Encoding]::UTF8))
$v.Dispose()
`;
execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { stdio: 'inherit' });
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0x202830:s=1080x1920:r=30', '-i', path.join(out, 'speech.wav'), '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '128k', path.join(out, 'recording.mp4')], { stdio: 'inherit' });

console.log(`${sentences.length} sentences, ${truth.announcedRetakes.length} announced retakes, ${truth.silentRestarts.length} silent restarts, ${truth.asides.length} aside`);
console.log(`wrote ${path.join(out, 'recording.mp4')}`);
