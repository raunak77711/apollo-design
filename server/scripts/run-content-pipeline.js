#!/usr/bin/env node
/**
 * Drive the Content Factory API end to end on a recording, and print what the analysis found.
 *
 *   node scripts/run-content-pipeline.js <video> [--board board.json] [--truth truth.json] [--api http://localhost:5010]
 *
 * Needs Apollo running with the Whisper worker up and a DeepSeek key set. With --truth (from
 * make-test-recording.js) it also checks the cuts against the mistakes that were planted.
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const val = (name, fallback = null) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const video = args.find((a) => !a.startsWith('--') && ![val('--board'), val('--truth'), val('--api')].includes(a));
const API = `${val('--api', 'http://localhost:5010')}/api/content`;
if (!video) { console.error('usage: node scripts/run-content-pipeline.js <video> [--board board.json] [--truth truth.json]'); process.exit(1); }

const j = async (res) => { const d = await res.json().catch(() => ({})); if (!res.ok) throw new Error(`${res.status} ${d.error || ''}`); return d; };
const post = (p, body, method = 'POST') => fetch(`${API}${p}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) }).then(j);
const get = (p) => fetch(`${API}${p}`).then(j);
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const t0 = Date.now();
const session = await post('/sessions', { title: path.basename(video, path.extname(video)) });
const bytes = fs.readFileSync(video);
await fetch(`${API}/sessions/${session.id}/video?name=${encodeURIComponent(path.basename(video))}`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes }).then(j);
if (val('--board')) {
  const spec = JSON.parse(fs.readFileSync(val('--board'), 'utf8'));
  await post(`/sessions/${session.id}/board`, { boardId: 'cli', title: spec.title, spec }, 'PUT');
}
await post(`/sessions/${session.id}/process`, {});

let s;
for (;;) {
  await new Promise((r) => setTimeout(r, 1500));
  s = await get(`/sessions/${session.id}`);
  const stage = s.transcription.status !== 'complete' ? `transcription ${s.transcription.status} ${Math.round((s.transcription.progress || 0) * 100)}%` : `analysis ${s.analysis.status} ${Math.round((s.analysis.progress || 0) * 100)}%`;
  process.stdout.write(`\r${((Date.now() - t0) / 1000).toFixed(0)}s  ${stage}          `);
  if (s.transcription.status === 'failed' || ['complete', 'failed', 'not_started'].includes(s.analysis.status) && s.transcription.status === 'complete') break;
}
console.log('');
if (s.transcription.status === 'failed') { console.error('transcription failed:', s.transcription.error); process.exit(2); }
if (s.analysis.status !== 'complete') { console.error('analysis:', s.analysis.status, s.analysis.error || s.analysis.reason); process.exit(3); }

const analysis = await get(`/sessions/${session.id}/analysis`);
console.log(`\nsession ${session.id}  |  transcript ${s.transcription.words} words, ${clock(s.transcription.duration)}  |  ${s.analysis.modelCalls} model calls (${s.analysis.cachedWindows} cached)  |  total ${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.log(`detector saw ${analysis.retakes.length} restart stretches; model proposed ${analysis.stats.proposed}, rejected ${analysis.stats.rejected.length}, below the bar ${analysis.stats.lowQuality}, duplicates ${analysis.stats.duplicates}; kept ${s.candidates.length}`);
for (const r of analysis.stats.rejected) console.log('  rejected:', r);
for (const w of analysis.warnings) console.log('  warning:', w);

console.log('\n=== SHORTS ===');
for (const c of s.candidates) {
  console.log(`\n[${c.score}] ${c.title}   ${clock(c.sourceStart)}-${clock(c.sourceEnd)} (${c.keptDuration}s kept)  topic=${c.topic}`);
  console.log(`    hook:  ${c.hook}`);
  console.log(`    why:   ${c.reason}`);
  console.log(`    scores hook ${c.scores.hook} / clarity ${c.scores.clarity} / value ${c.scores.value} / relevance ${c.scores.audienceRelevance}`);
  for (const seg of c.sourceSegments) console.log(`    ${seg.action === 'keep' ? 'KEEP   ' : 'CUT    '} ${clock(seg.start)}-${clock(seg.end)} ${seg.reason}`);
  for (const d of c.discarded) console.log(`      cut: "${d.text.slice(0, 110)}"`);
  if (c.boardMatches.length) console.log(`    board: ${c.boardMatches.slice(0, 4).map((m) => `${m.blockId}(${m.type}, ${m.confidence})`).join('  ')}`);
}

if (val('--truth')) {
  const truth = JSON.parse(fs.readFileSync(val('--truth'), 'utf8'));
  const keptText = s.candidates.map((c) => c.text).join('\n');
  const leaks = [];
  if (/\bLet me say that again\b/i.test(keptText)) leaks.push('a restart announcement was KEPT');
  const stumbles = keptText.match(/\b\w+,? uh,? \w+/gi) || [];
  console.log('\n=== CHECK AGAINST PLANTED MISTAKES ===');
  console.log(`kept speech containing "Let me say that again": ${/\bLet me say that again\b/i.test(keptText) ? 'YES (bad)' : 'none (good)'}`);
  console.log(`kept speech containing ", sorry.": ${/, sorry\./i.test(keptText) ? 'YES (bad)' : 'none (good)'}`);
  console.log(`kept speech containing the "uh," stutter pattern: ${stumbles.length ? `YES (bad): ${stumbles.slice(0, 3).join(' | ')}` : 'none (good)'}`);
  console.log(`kept speech containing the aside (subscribe / cat): ${/subscribe|my cat/i.test(keptText) ? 'YES (bad)' : 'none (good)'}`);
  const planted = [...truth.announcedRetakes, ...truth.silentRestarts];
  let covered = 0;
  let cleanTake = 0;
  for (const p of planted) {
    const line = p.line.split(/\. (?=[A-Z])/)[0].replace(/[.,]/g, '').toLowerCase();
    const inClip = s.candidates.some((c) => c.text.replace(/[.,]/g, '').toLowerCase().includes(line));
    if (inClip) {
      covered += 1;
      const text = s.candidates.find((c) => c.text.replace(/[.,]/g, '').toLowerCase().includes(line)).text.replace(/[.,]/g, '').toLowerCase();
      if (text.split(line).length - 1 === 1) cleanTake += 1; // the clean take appears exactly once: no stitched duplicate
    }
  }
  console.log(`planted retakes whose line made it into a short: ${covered}/${planted.length}; of those, said exactly once (no stitched duplicate): ${cleanTake}/${covered}`);
  console.log(leaks.length ? `PROBLEMS: ${leaks.join('; ')}` : 'no restart announcements leaked into any short');
}
fs.writeFileSync(path.join(path.dirname(path.resolve(video)), 'pipeline-result.json'), JSON.stringify({ session: s, analysis }, null, 2));
console.log(`\nfull result: ${path.join(path.dirname(path.resolve(video)), 'pipeline-result.json')}`);
