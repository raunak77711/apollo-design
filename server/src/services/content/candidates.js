import { flattenWords } from '../transcription/transcriptSchema.js';
import { boardMatchesFor } from './analysis/candidate.js';
import { buildBoardIndex } from './boardIndex.js';
import { buildClip, keepSegments } from './director/clipTimeline.js';
import { contextFor, directCandidate, packTrack } from './director/directorService.js';
import { DIRECTOR_SYSTEM, buildDirectorPrompt } from './director/llmDirector.js';
import { ANNOTATION_KINDS, BOARD_ANIMATIONS, CAMERA_ACTIONS, DIRECTOR_VERSION, EVENT_TYPES, STATEMENT_STYLES, normalizeDirectorTrack } from './director/schema.js';
import { OUTPUT, lengthWarnings } from './platforms.js';
import { DEFAULT_SETTINGS, mergeSettings } from './settings.js';

/**
 * Everything about a short once it exists: reviewing it, trimming it, directing its edit, handing the edit
 * to another AI, and assembling exactly what the video engine needs to play or render it.
 */

export const ENGINE_PROPS_VERSION = 1;
const STATUSES = ['pending', 'approved', 'rejected'];
const round = (v) => Math.round(v * 100) / 100;

export class CandidateError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const PAD_START = 0.12;
const PAD_END = 0.22;
const TRIM_REACH = 12; // seconds a trim may move an edge from where the analysis put it

export function createCandidateApi({ store, transcription, getProvider = () => null, llmCache = null, log = console }) {
  async function context(id, cid) {
    const session = await store.get(id);
    const candidate = (session.candidates || []).find((c) => c.id === cid);
    if (!candidate) throw new CandidateError(404, 'That short no longer exists.');
    const hit = session.source ? await transcription.getCached(session.source.sha256) : null;
    if (!hit) throw new CandidateError(409, 'This recording has no transcript yet.');
    const snapshot = await store.readJson(id, 'board.json');
    const tally = (await store.readJson(id, 'tally.json'))?.tally || null;
    return { session, candidate, transcript: hit.transcript, snapshot, tally };
  }

  const settingsOf = (session) => mergeSettings(session.settings || DEFAULT_SETTINGS, {});

  async function saveCandidate(id, cid, mutate) {
    return store.update(id, (s) => {
      const c = s.candidates.find((x) => x.id === cid);
      if (c) mutate(c, s);
    });
  }

  /** Direct one short and store its track. */
  async function direct(id, cid, { ai }) {
    const ctx = await context(id, cid);
    const useAi = ai ?? settingsOf(ctx.session).aiDirector;
    const track = await directCandidate({ ...ctx, provider: getProvider(), ai: useAi, cache: llmCache });
    await saveCandidate(id, cid, (c) => { c.director = track; });
    return track;
  }

  /** Run a list of jobs a few at a time. */
  async function pool(items, size, fn) {
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const item = items[next];
        next += 1;
        try {
          await fn(item);
        } catch (err) {
          log.error?.('[content] directing failed:', err.message);
        }
      }
    }));
  }

  return {
    /* ------------------------------- review ------------------------------- */

    async updateCandidate(id, cid, patch = {}) {
      await context(id, cid).catch((err) => { if (err.status === 404) throw err; });
      return store.update(id, (s) => {
        const c = s.candidates.find((x) => x.id === cid);
        if (!c) throw new CandidateError(404, 'That short no longer exists.');
        if (patch.status !== undefined) {
          if (!STATUSES.includes(patch.status)) throw new CandidateError(400, 'Status must be pending, approved or rejected.');
          if (patch.status !== c.status) c.reviewedAt = patch.status === 'pending' ? undefined : new Date().toISOString();
          c.status = patch.status;
          if (patch.status !== 'approved' && c.render?.status === 'queued') c.render = undefined;
        }
        if (patch.title !== undefined) {
          const t = String(patch.title).replace(/\s+/g, ' ').trim().slice(0, 80);
          if (!t) throw new CandidateError(400, 'A short needs a title.');
          c.title = t;
        }
        if (patch.note !== undefined) c.note = String(patch.note).slice(0, 500);
        if (patch.captions !== undefined) c.edits = { ...(c.edits || {}), captions: patch.captions === false ? false : undefined };
        if (patch.captionOverrides !== undefined) {
          const overrides = { ...(c.edits?.captionOverrides || {}) };
          for (const [key, value] of Object.entries(patch.captionOverrides || {})) {
            if (!/^\d+$/.test(key)) continue;
            const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
            if (!text) delete overrides[key];
            else overrides[key] = text.slice(0, 60);
          }
          c.edits = { ...(c.edits || {}), captionOverrides: overrides };
        }
      });
    },

    /** Move the start and/or end of a short, snapped to word boundaries; the edit shifts with it. */
    async trimCandidate(id, cid, { start, end }) {
      const ctx = await context(id, cid);
      const words = flattenWords(ctx.transcript);
      const c = structuredClone(ctx.candidate);
      const keeps = c.sourceSegments.filter((s) => s.action === 'keep');
      const origStart = keeps[0].start;
      const origEnd = keeps[keeps.length - 1].end;

      const wantStart = start === undefined ? origStart : Number(start);
      const wantEnd = end === undefined ? origEnd : Number(end);
      if (!Number.isFinite(wantStart) || !Number.isFinite(wantEnd)) throw new CandidateError(400, 'Give a start and an end in seconds.');
      if (Math.abs(wantStart - origStart) > TRIM_REACH || Math.abs(wantEnd - origEnd) > TRIM_REACH) throw new CandidateError(400, `A short can be trimmed by up to ${TRIM_REACH}s at either end; run the analysis again for a different clip.`);

      // Snap to the speech: start just before a word begins, end just after one finishes, mid-silence from its neighbour.
      const nearest = (t, key) => words.reduce((best, w, i) => (Math.abs(w[key] - t) < Math.abs(words[best][key] - t) ? i : best), 0);
      const si = nearest(wantStart, 'start');
      const ei = nearest(wantEnd, 'end');
      if (ei <= si) throw new CandidateError(400, 'The end must come after the start.');
      const sPrev = words[si - 1];
      const eNext = words[ei + 1];
      const newStart = Math.max(0, sPrev ? Math.max(words[si].start - PAD_START, (sPrev.end + words[si].start) / 2) : words[si].start - PAD_START);
      const newEnd = eNext ? Math.min(words[ei].end + PAD_END, (words[ei].end + eNext.start) / 2) : words[ei].end + PAD_END;
      if (newEnd - newStart < 8) throw new CandidateError(400, 'A short needs at least 8 seconds.');

      // Re-cut the segment list around the new edges.
      let segs = c.sourceSegments.filter((s) => s.end > newStart && s.start < newEnd).map((s) => ({ ...s, start: Math.max(s.start, newStart), end: Math.min(s.end, newEnd) }));
      if (!segs.length || segs[0].start > newStart + 0.01) segs.unshift({ start: newStart, end: segs[0]?.start ?? newEnd, action: 'keep', reason: 'main', from: segs[0]?.from, to: segs[0]?.from, text: '' });
      if (segs[segs.length - 1].end < newEnd - 0.01) segs.push({ start: segs[segs.length - 1].end, end: newEnd, action: 'keep', reason: 'main', text: '' });
      c.sourceSegments = segs.map((s) => ({ ...s, start: round(s.start), end: round(s.end), text: words.filter((w) => w.start >= s.start - 0.02 && w.end <= s.end + 0.02).map((w) => w.word).join(' ') }));
      const k = c.sourceSegments.filter((s) => s.action === 'keep');
      if (!k.length) throw new CandidateError(400, 'Nothing would be left of this short.');
      c.sourceStart = k[0].start;
      c.sourceEnd = k[k.length - 1].end;
      c.duration = round(c.sourceEnd - c.sourceStart);
      c.keptDuration = round(k.reduce((n, s) => n + (s.end - s.start), 0));
      c.text = k.map((s) => s.text).join(' ').trim();
      c.hook = (k[0].text || c.text).slice(0, 160);
      c.boardMatches = boardMatchesFor(ctx.tally, c.sourceSegments);
      c.edits = { ...(c.edits || {}), trim: { start: round(c.sourceStart), end: round(c.sourceEnd) } };

      // Clip time started at the old first kept word: move every event with it, then re-ground them on the new words.
      const shift = origStart - k[0].start;
      const { ctx: dctx } = contextFor({ candidate: c, transcript: ctx.transcript, snapshot: ctx.snapshot, tally: ctx.tally });
      if (c.director) {
        const moved = c.director.events.map((e) => ({ ...e, at: e.at + shift }));
        const { events, issues } = normalizeDirectorTrack(moved, dctx);
        c.director = { ...c.director, events, ...(issues.length ? { issues } : { issues: undefined }) };
      }
      await saveCandidate(id, cid, (x) => Object.assign(x, c));
      return (await store.get(id)).candidates.find((x) => x.id === cid);
    },

    /* ------------------------------- directing ------------------------------- */

    /** Replace the edit with one from a person, or from another AI. Validated and grounded before it is kept. */
    async setDirector(id, cid, { events, source = 'manual' }) {
      const ctx = await context(id, cid);
      const { ctx: dctx } = contextFor(ctx);
      const { events: clean, issues } = normalizeDirectorTrack(events, dctx);
      const track = packTrack({ events: clean, issues, source: source === 'external' ? 'external' : 'manual' });
      await saveCandidate(id, cid, (c) => { c.director = track; });
      return track;
    },

    regenerateDirector: (id, cid, { ai } = {}) => direct(id, cid, { ai }),

    /** Direct every short that has no edit yet (right after analysis). */
    async directMissing(id) {
      const session = await store.get(id);
      const todo = (session.candidates || []).filter((c) => !c.director).map((c) => c.id);
      await pool(todo, 3, (cid) => direct(id, cid, {}));
    },

    /** Re-run the director on every short whose edit was not written by a person. */
    async directAll(id, { ai, includeManual = false } = {}) {
      const session = await store.get(id);
      const todo = (session.candidates || []).filter((c) => includeManual || !['manual', 'external'].includes(c.director?.source)).map((c) => c.id);
      await pool(todo, 3, (cid) => direct(id, cid, { ai }));
      return todo.length;
    },

    /** After the board or the clip changes: keep what is still valid, drop what is not, no model call. */
    async revalidateDirectors(id) {
      const session = await store.get(id);
      for (const c of session.candidates || []) {
        if (!c.director) continue;
        try {
          const ctx = await context(id, c.id);
          const { ctx: dctx } = contextFor(ctx);
          const { events, issues } = normalizeDirectorTrack(c.director.events, dctx);
          await saveCandidate(id, c.id, (x) => { x.director = { ...x.director, events, ...(issues.length ? { issues } : { issues: undefined }) }; });
        } catch {
          /* no transcript yet: nothing to validate against */
        }
      }
    },

    /* ----------------------- a hand-off to Claude / ChatGPT ----------------------- */

    /** Everything an outside AI needs to improve one short's edit, and nothing it could break. */
    async exportPackage(id, cid) {
      const ctx = await context(id, cid);
      const { clip, blocks } = contextFor(ctx);
      return {
        format: 'apollo-short-package',
        version: 1,
        instructions: 'Improve the Director Track below and send back ONLY JSON: { "events": [ ... ] }. Use only the event types in "vocabulary". Times are clip seconds. Quote emphasis, number and annotation text exactly as spoken in "transcript". Use only blockIds listed in "boardBlocks". Apollo validates everything you send; anything it cannot place is dropped with a reason.',
        short: { id: ctx.candidate.id, title: ctx.candidate.title, duration: clip.duration, hook: ctx.candidate.hook, topic: ctx.candidate.topic },
        vocabulary: {
          eventTypes: EVENT_TYPES,
          emphasis: { at: 'seconds', text: '1-3 spoken words', strength: '1-3' },
          number: { at: 'seconds', value: '$10,000', label: 'optional' },
          statement: { at: 'seconds', text: 'max 48 chars', style: STATEMENT_STYLES, duration: 'seconds' },
          camera: { at: 'seconds', action: CAMERA_ACTIONS, amount: '1.05-1.25 for punch_in' },
          board: { at: 'seconds', blockId: 'from boardBlocks', animation: BOARD_ANIMATIONS, part: 'optional part path', duration: 'seconds 2-12' },
          comparison: { at: 'seconds', left: 'label', right: 'label', duration: 'seconds' },
          annotation: { at: 'seconds', kind: ANNOTATION_KINDS, text: 'one spoken word' },
        },
        transcript: clip.words.map((w) => ({ word: w.word, start: w.start, end: w.end })),
        boardBlocks: blocks.map((b) => ({ blockId: b.blockId, type: b.type, saidFrom: b.first, saidTo: b.last, parts: b.parts.map((p) => ({ path: p.path, text: p.text, said: p.hits[0].at })) })),
        director: { version: DIRECTOR_VERSION, source: ctx.candidate.director?.source || 'none', events: (ctx.candidate.director?.events || []).map(({ id: _id, ...rest }) => rest) },
      };
    },

    /** The same hand-off as one block of text to paste into Claude or ChatGPT. */
    async promptText(id, cid) {
      const ctx = await context(id, cid);
      const { clip, blocks } = contextFor(ctx);
      const { user } = buildDirectorPrompt({ title: ctx.candidate.title, duration: clip.duration, words: clip.words, blocks });
      const current = JSON.stringify({ events: (ctx.candidate.director?.events || []).map(({ id: _id, ...rest }) => rest) }, null, 2);
      return `${DIRECTOR_SYSTEM}\n\n---\n\n${user.replace(/\nReturn the JSON now\.$/, '')}\n\nTHE CURRENT EDIT (improve it, or replace it):\n${current}\n\nReturn ONLY the JSON { "events": [ ... ] } now.`;
    },

    /* ------------------------------ for the engine ------------------------------ */

    /** Exactly what the live preview plays and the renderer renders. */
    async engineProps(id, cid, { videoSrc } = {}) {
      const ctx = await context(id, cid);
      const settings = settingsOf(ctx.session);
      const { clip, blocks: clipBlocks } = contextFor(ctx);
      const framing = ctx.session.media?.framing;
      const events = (ctx.candidate.director?.events || []).filter((e) => !e.disabled);
      const index = ctx.snapshot?.spec ? buildBoardIndex(ctx.snapshot.spec) : null;

      const blocks = {};
      for (const e of events) {
        if (e.type !== 'board' || blocks[e.blockId]) continue;
        const section = ctx.snapshot?.spec?.sections.find((s) => s.id === e.sectionId);
        const block = section?.blocks.find((b) => b.id === e.blockId);
        // `hits` is when each part of the block is spoken (clip seconds): it times the parts' appearance in the engine.
        const spoken = clipBlocks.find((b) => b.blockId === e.blockId);
        const hits = spoken ? spoken.parts.flatMap((part) => part.hits.slice(0, 1).map((h) => ({ path: part.path, at: h.at }))) : [];
        if (block) blocks[e.blockId] = { sectionId: section.id, block, hits };
      }
      const proxy = ctx.session.media?.proxy;
      return {
        version: ENGINE_PROPS_VERSION,
        title: ctx.candidate.title,
        fps: OUTPUT.fps,
        platform: settings.platform,
        videoSrc: videoSrc || (proxy?.status === 'complete' ? `/storage/content/sessions/${id}/proxy.mp4` : `/storage/content/sessions/${id}/${ctx.session.source.storedName}`),
        source: framing?.status === 'complete' ? { width: framing.width, height: framing.height } : { width: 1280, height: 720 },
        framing: framing?.status === 'complete' ? { keyframes: framing.keyframes, head: framing.head } : { keyframes: [], head: null },
        settings: { aspect: settings.framing.aspect, handsRoom: settings.framing.handsRoom, captions: { ...settings.captions, enabled: settings.captions.enabled && ctx.candidate.edits?.captions !== false }, background: settings.background },
        segments: clip.segments,
        duration: clip.duration,
        words: clip.words,
        events,
        blocks,
        boardTitle: index?.title || '',
        warnings: lengthWarnings(clip.duration, settings.platform),
      };
    },

    keepSegments,
    buildClip,
  };
}
