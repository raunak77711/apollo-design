import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config/env.js';
import { createRenderClient } from './content/renderClient.js';
import { buildDirectorPrompt } from './content/director/llmDirector.js';
import { normalizeDirectorTrack } from './content/director/schema.js';

export const MOTION_VERSION = 'content-machine-motion-v2';
export const defaultEditingRules = { subtitlePosition: 'auto', subtitleSize: 'medium', maxWords: 4 };
export function editingRules(input = {}) {
  const rules = { ...defaultEditingRules, ...input };
  if (!['auto', 'lower', 'middle', 'upper'].includes(rules.subtitlePosition) || !['small', 'medium', 'large'].includes(rules.subtitleSize) || ![3, 4, 6].includes(rules.maxWords)) throw new Error('Choose valid subtitle placement, size and words per caption.');
  return { subtitlePosition: rules.subtitlePosition, subtitleSize: rules.subtitleSize, maxWords: rules.maxWords };
}
const normalized = text => text.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
export function validateMotionPlan(result, cues, duration) {
  if (!Array.isArray(result?.events)) throw new Error('DeepSeek returned an invalid animation plan.');
  const maxEvents = Math.min(6, Math.max(1, Math.floor(duration / 8)));
  const events = result.events.map(event => {
    const cue = Number.isInteger(event.cueId) ? cues[event.cueId] : null;
    if (!cue || !['keyword', 'underline', 'takeaway'].includes(event.type) || typeof event.text !== 'string' || !event.text.trim() || event.text.length > 56 || !normalized(cue.text).includes(normalized(event.text))) throw new Error('DeepSeek animation text must be a short phrase from the transcript.');
    const start = Math.max(0, cue.start), end = Math.min(duration, start + Math.max(1.6, Math.min(3.5, cue.end - cue.start)));
    return { type: event.type, text: event.text.trim(), start, end };
  }).sort((a, b) => a.start - b.start);
  const selected = [];
  for (const event of events) {
    if (event.end - event.start < .8 || (selected.length && event.start < selected.at(-1).end + 2)) continue;
    selected.push(event);
    if (selected.length >= maxEvents) break;
  }
  return selected;
}
export async function planMotion(cues, duration, role, ai, layout) {
  if (!cues.length || duration < .8) return [];
  const words = cues.flatMap(cue => {
    const tokens = cue.text.trim().split(/\s+/);
    return tokens.map((word, i) => ({ word, start: cue.start + (cue.end - cue.start) * i / tokens.length, end: cue.start + (cue.end - cue.start) * (i + 1) / tokens.length }));
  });
  const prompt = buildDirectorPrompt({ title: `Content Machine ${role}`, duration, words, blocks: [] });
  const result = await ai.chat({ ...prompt, system: `${prompt.system}\nThis is a ${role} clip. Prefer a useful comparison or a spoken number when it clarifies the idea; otherwise use a short statement or 1-3 word emphasis. A short hook needs at most one strong beat. Do not create board or camera events. Do not invent facts, numbers or examples. The full transcript is provided so select complete ideas, not chopped subtitle fragments. Use 2-6 purposeful visual beats for a 60-second body.\nFace detection and safe placement are enforced by the app. Face detected: ${!!layout?.faceDetected}. Never write coordinates or code.`, temperature: .2, maxTokens: 2200 });
  if (!Array.isArray(result?.events)) throw new Error('DeepSeek returned an invalid animation plan.');
  if (!result.events.some(e => e && Number.isInteger(e.cueId))) {
    const { events: track } = normalizeDirectorTrack(result, { words, duration, blocks: new Map() });
    const events = [];
    for (const event of track) {
      if (!['emphasis', 'annotation', 'number', 'comparison', 'statement'].includes(event.type)) continue;
      const start = Math.max(.15, event.at);
      const end = Math.min(duration, start + (event.type === 'comparison' ? Math.min(4.5, event.duration || 4) : Math.max(2, Math.min(3.5, event.duration || 2.6))));
      if (end - start < .8 || events.some(e => start < e.end + 1.2 && end > e.start)) continue;
      // Any displayed figure must already exist in the transcript.
      const text = event.text || event.value || `${event.left} ${event.right}`;
      const digits = text.match(/\d+(?:[.,]\d+)*/g) || [];
      if (digits.some(d => !cues.some(c => c.text.replaceAll(',', '').includes(d.replaceAll(',', ''))))) continue;
      events.push({ type: { emphasis: 'keyword', annotation: 'underline', number: 'number', comparison: 'comparison', statement: 'takeaway' }[event.type], text: event.text || event.value || '', ...(event.type === 'comparison' ? { left: event.left, right: event.right } : {}), ...(event.type === 'number' && event.label ? { label: event.label } : {}), start, end });
      if (events.length >= Math.min(6, Math.max(1, Math.ceil(duration / 10)))) break;
    }
    if (events.length) return events;
    // Visible, speech-grounded fallback rather than silently exporting no animation.
    const meaningful = words.filter(w => w.word.replace(/\W/g, '').length >= 6).sort((a, b) => b.word.length - a.word.length)[0] || words[0];
    if (!meaningful) return [];
    const start = Math.max(0, Math.min(meaningful.start, duration - 1));
    return [{ type: 'keyword', text: meaningful.word.replace(/[.,!?;:]+$/, ''), start, end: Math.min(duration, start + 2.5), fallback: true }];
  }
  // AI selects moments, never authors the on-screen claims. Ignore out-of-range selections.
  const events = result.events.filter(e => e && Number.isInteger(e.cueId) && cues[e.cueId] && ['keyword', 'underline', 'takeaway'].includes(e.type)).map(e => {
    const words = cues[e.cueId].text.trim().split(/\s+/);
    let text = '';
    for (const word of words) {
      const next = text ? `${text} ${word}` : word;
      if (next.length > 56) break;
      text = next;
    }
    return { cueId: e.cueId, type: e.type, text };
  }).filter(e => e.text);
  return validateMotionPlan({ events }, cues, duration);
}
export function createCombinatorMotion({ client = createRenderClient({ url: config.content.renderWorkerUrl }), storageRoot = config.storageRoot } = {}) {
  function relative(file) {
    const rel = path.relative(storageRoot, file);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Animation files must be in shared server storage.');
    return rel.split(path.sep).join('/');
  }
  return {
    async status() {
      const health = await client.health();
      return { available: !!(health.ok && health.ffmpeg && health.contentMachineMotion === MOTION_VERSION), reason: health.reason || 'Start or restart the render worker (node render/worker.mjs) for HTML animations.' };
    },
    async render(input, output, props, onProgress) {
      return client.render({ id: randomUUID(), kind: 'content-machine', sourceRel: relative(input), outRel: relative(output), props }, { onProgress });
    },
  };
}
