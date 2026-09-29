import { getAIProvider } from './ai/index.js';
import {
  HEADLINE_TYPES, SPEC_VERSION, degradedSection, normalizeOutline, normalizeSection,
} from '../design/board/schema.js';
import { validateBoardOperation } from '../design/board/operations.js';
import { buildEditPrompt, buildOutlinePrompt, buildSectionPrompt } from '../design/board/prompts.js';

/**
 * Jam board generation.
 *
 * One outline call decides the sections, then one call per section builds its
 * blocks, four at a time. Splitting the work is what makes a 12-section board
 * possible at all — one call for the lot would sit at DeepSeek's output ceiling
 * and a single stray brace would lose everything — and it lets a failed section
 * be retried, or replaced by a plain one, without touching the others.
 */

export const BRIEF_MIN = 40;
export const BRIEF_MAX = 60_000;
const CONCURRENCY = 4;
const FATAL_STATUSES = new Set([401, 402, 403]);

/** An error whose message is safe to show a person. */
export class BoardError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'BoardError';
    this.status = status;
  }
}

export function checkBrief(brief) {
  if (typeof brief !== 'string' || brief.trim().length < BRIEF_MIN) {
    return `Write at least ${BRIEF_MIN} characters so Apollo has something to build from.`;
  }
  if (brief.length > BRIEF_MAX) {
    return `That brief is too long. Keep it under ${BRIEF_MAX.toLocaleString('en-US')} characters.`;
  }
  return null;
}

/** A bad key or a missing model will fail every section the same way — say so once, loudly. */
const isFatal = (err) => err?.name === 'NotConfiguredError' || FATAL_STATUSES.has(err?.status);

function throwIfAborted(signal) {
  if (signal?.aborted) {
    const err = new Error('aborted');
    err.name = 'AbortError';
    throw err;
  }
}

/** Something a person can talk over: it has at least one block and a headline. */
export const isUsable = (section) =>
  section.blocks.length > 0 && section.blocks.some((b) => HEADLINE_TYPES.includes(b.type));

async function generateOutline({ brief, provider, signal }) {
  throwIfAborted(signal);
  const raw = await provider.completeJSON({ ...buildOutlinePrompt(brief), temperature: 0.3, maxTokens: 1800, signal });
  const outline = normalizeOutline(raw);
  if (!outline) {
    throw new BoardError(
      "Apollo couldn't find any sections in that brief. Describe the video as a sequence of chapters or beats and try again.",
      422
    );
  }
  return outline;
}

/**
 * Build one section. Two attempts: the second is told exactly what the first
 * got wrong. The better usable attempt wins; if neither is usable the section
 * is replaced by a plain title-and-statement one so the board still exists.
 * Aborts and fatal provider errors are the only things that propagate.
 */
export async function generateSection({ brief, outline, index, note = '', provider = getAIProvider(), signal }) {
  const entry = outline.sections[index];
  let best = null;
  let issues = [];

  for (let attempt = 0; attempt < 2; attempt += 1) {
    throwIfAborted(signal);
    try {
      const raw = await provider.completeJSON({
        ...buildSectionPrompt({ brief, outline, index, note, issues }),
        temperature: attempt === 0 ? 0.5 : 0.3,
        maxTokens: 3500,
        signal,
      });
      const { section, issues: found } = normalizeSection({ ...entry, blocks: raw?.blocks }, index);
      if (isUsable(section) && (!best || section.blocks.length > best.blocks.length)) best = section;
      if (!found.length) return section;
      issues = found;
    } catch (err) {
      if (err?.name === 'AbortError' || isFatal(err)) throw err;
      issues = ['the previous attempt failed to produce valid JSON'];
    }
  }
  return best || degradedSection(index, entry);
}

export async function generateBoard({ brief, provider = getAIProvider(), signal, onEvent = () => {}, concurrency = CONCURRENCY }) {
  const problem = checkBrief(brief);
  if (problem) throw new BoardError(problem, 400);

  const outline = await generateOutline({ brief, provider, signal });
  onEvent('outline', {
    title: outline.title,
    audience: outline.audience,
    sections: outline.sections.map((s, i) => ({ id: `s${i + 1}`, ...s })),
  });

  const sections = new Array(outline.sections.length);
  let cursor = 0;
  let failure = null;

  const worker = async () => {
    while (!failure) {
      const index = cursor;
      cursor += 1;
      if (index >= sections.length) return;
      try {
        const section = await generateSection({ brief, outline, index, provider, signal });
        sections[index] = section;
        onEvent('section', { index, section });
      } catch (err) {
        failure = err;
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, sections.length) }, worker));
  if (failure) throw failure;

  return { version: SPEC_VERSION, title: outline.title, audience: outline.audience, sections };
}

/* ---------------------------------- edits ---------------------------------- */

export const EDIT_MIN_CHARS = 3;
export const EDIT_MAX_CHARS = 600;
const MAX_EDIT_OPS = 40;
const RAW_CONTEXT_CHARS = 500_000; //  refuse to even walk something absurd
const MAX_CONTEXT_CHARS = 90_000; //   what may actually reach the model (roughly 25k tokens)
const CAPS = { sections: 20, blocks: 12, parts: 30, annotations: 60, selection: 30, label: 80 };

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** A label the model may read: short, one line, and never pixel data. */
function safeLabel(v) {
  if (typeof v !== 'string') return '';
  if (v.startsWith('data:')) return '[image]';
  const one = v.replace(/\s+/g, ' ').trim();
  return one.length > CAPS.label ? `${one.slice(0, CAPS.label - 1)}…` : one;
}

const safeId = (v) => (typeof v === 'string' && /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/.test(v) ? v : null);

/**
 * The client sends a compact outline of the board. It is untrusted input to a
 * model prompt: bound its size, and make sure no image data — the lesson of
 * `sanitizeForPrompt` in DeepSeekProvider — can ride along in a label.
 */
export function sanitizeEditContext(outline, selection = []) {
  if (!isObj(outline) || !Array.isArray(outline.sections)) throw new BoardError('The board outline is missing.', 400);
  if (JSON.stringify(outline).length > RAW_CONTEXT_CHARS) throw new BoardError('That board is too large to edit with a command.', 400);

  const sections = outline.sections.slice(0, CAPS.sections).map((s) => ({
    id: safeId(s?.id),
    title: safeLabel(s?.title),
    blocks: (Array.isArray(s?.blocks) ? s.blocks : []).slice(0, CAPS.blocks).map((b) => ({
      id: safeId(b?.id),
      type: safeLabel(b?.type),
      ...(b?.hidden ? { hidden: true } : {}),
      parts: (Array.isArray(b?.parts) ? b.parts : []).slice(0, CAPS.parts).map((p) => ({
        id: safeId(p?.id), label: safeLabel(p?.label), ...(p?.hidden ? { hidden: true } : {}),
      })).filter((p) => p.id),
    })).filter((b) => b.id),
  })).filter((s) => s.id);

  const annotations = (Array.isArray(outline.annotations) ? outline.annotations : []).slice(0, CAPS.annotations).map((a) => ({
    id: safeId(a?.id), kind: safeLabel(a?.kind), section: safeId(a?.section), ...(a?.label ? { label: safeLabel(a.label) } : {}),
  })).filter((a) => a.id);

  const clean = { title: safeLabel(outline.title), sections, annotations };
  if (JSON.stringify(clean).length > MAX_CONTEXT_CHARS) throw new BoardError('That board is too large to edit with a command.', 400);
  return {
    outline: clean,
    selection: (Array.isArray(selection) ? selection : []).map(safeId).filter(Boolean).slice(0, CAPS.selection),
  };
}

function knownIds(outline) {
  const ids = new Set();
  const sections = new Set();
  for (const s of outline.sections) {
    ids.add(s.id);
    sections.add(s.id);
    for (const b of s.blocks) {
      ids.add(b.id);
      for (const p of b.parts) ids.add(p.id);
    }
  }
  for (const a of outline.annotations) ids.add(a.id);
  return { ids, sections };
}

/**
 * Direct mode: an instruction in, validated operations out. The model can only
 * name things that exist — an operation that mentions an id the outline did not
 * contain is a hallucination and is dropped, exactly like one that fails the
 * shape check. Nothing here changes a board; the client applies the result.
 */
export async function editBoard({ message, outline, selection = [], provider = getAIProvider(), signal }) {
  const text = typeof message === 'string' ? message.trim() : '';
  if (text.length < EDIT_MIN_CHARS || text.length > EDIT_MAX_CHARS) {
    throw new BoardError(`Give Apollo an instruction between ${EDIT_MIN_CHARS} and ${EDIT_MAX_CHARS} characters.`, 400);
  }
  const context = sanitizeEditContext(outline, selection);
  const { ids, sections } = knownIds(context.outline);

  throwIfAborted(signal);
  const raw = await provider.completeJSON({
    ...buildEditPrompt({ message: text, outline: context.outline, selection: context.selection }),
    temperature: 0.2,
    maxTokens: 2500,
    signal,
  });

  const operations = [];
  let dropped = 0;
  for (const candidate of (Array.isArray(raw?.operations) ? raw.operations : []).slice(0, MAX_EDIT_OPS)) {
    const checked = validateBoardOperation(candidate);
    const refs = checked.ok
      ? [...(checked.op.targets || []), checked.op.relativeTo, checked.op.from, checked.op.to].filter(Boolean)
      : [];
    const known = checked.ok && refs.every((id) => ids.has(id)) && (!checked.op.section || sections.has(checked.op.section));
    if (known) operations.push(checked.op);
    else dropped += 1;
  }
  // Operations beyond the cap are ignored, not counted as errors.
  const sentence = typeof raw?.message === 'string' ? raw.message.trim().slice(0, 200) : '';
  return {
    operations,
    message: sentence || (operations.length ? 'Done.' : "I couldn't turn that into a change to the board."),
    dropped,
  };
}
