import sharp from 'sharp';
import { nanoid } from 'nanoid';
import { projects } from '../store/index.js';
import { validateDocument } from '../design/schema.js';

/**
 * Version history.
 *
 * The rule the whole feature rests on: **generating never destroys anything**.
 * Someone who draws an idea, generates, dislikes it and generates again must
 * be able to get the first one back — otherwise "try again" is a gamble rather
 * than an invitation, and people stop pressing it.
 *
 * A version is a full snapshot, not a diff. There are only ever a handful of
 * them, a design document is a few kilobytes of JSON, and being able to hand
 * one straight back to the editor unchanged is worth far more than the bytes
 * a diff would save.
 *
 * Versions live on the project record rather than in a collection of their
 * own, matching the MVP's decision to embed the document there too (see the
 * README's honest-status notes). The boundary can be split out later without
 * touching anything above this module.
 */

/** Beyond this the oldest versions are dropped — this is a history, not an archive. */
const MAX_VERSIONS = 40;

/** Working resolution for a stored sketch: enough to redraw from, small enough to keep. */
const SCRIBBLE_MAX_PX = 1024;

/**
 * A sketch is stored twice: as a picture, and as the strokes that made it.
 *
 * The picture is what the history rail shows and what a vision model reads.
 * The strokes are what makes *restoring* a sketch mean something — reopening
 * version 1 puts a live, editable drawing back on the canvas rather than a
 * flat image you can only draw on top of. They are cheap (a few hundred
 * points), but not free, so both the stroke count and the points within each
 * one are capped.
 */
const MAX_STROKES = 600;
const MAX_POINTS_PER_STROKE = 900;

export const VERSION_KINDS = ['scribble', 'generated', 'edit'];

/* -------------------------------- reading -------------------------------- */

/**
 * The history for a project, oldest first, **without** the documents.
 *
 * The list is rendered as a rail of small previews and a document per entry
 * would make it many times larger than the page needs. The full snapshot is
 * fetched only when a version is actually opened or restored.
 */
export async function listVersions(projectId) {
  const project = await projects.get(projectId);
  if (!project) return null;
  return (project.versions || []).map(summarize);
}

export async function getVersion(projectId, versionId) {
  const project = await projects.get(projectId);
  if (!project) return null;
  return (project.versions || []).find((v) => v.id === versionId) || null;
}

/** A version without its document or strokes — what the history rail renders from. */
function summarize(version) {
  const { document, strokes, ...rest } = version;
  return {
    ...rest,
    // Enough to draw an accurate card without shipping every layer.
    preview: document ? { canvas: document.canvas, elements: (document.elements || []).slice(0, 60) } : null,
    elementCount: document?.elements?.length || 0,
    strokeCount: Array.isArray(strokes) ? strokes.length : 0,
  };
}

/* -------------------------------- writing -------------------------------- */

/**
 * Append a version. Returns `{ versions, version }`, or null if there is no
 * such project.
 *
 * `document` is validated here rather than trusted, because a version is
 * something the editor will later be asked to load: an invalid snapshot would
 * fail at restore time, long after the mistake, and with nothing left to
 * explain it.
 */
export async function addVersion(projectId, { kind, label, document, scribble, strokes, note, prompt } = {}) {
  const project = await projects.get(projectId);
  if (!project) return null;

  if (document !== undefined && document !== null && !validateDocument(document)) {
    return { error: 'Invalid design document' };
  }

  const existing = project.versions || [];
  const version = {
    id: nanoid(),
    index: (existing[existing.length - 1]?.index || 0) + 1,
    kind: VERSION_KINDS.includes(kind) ? kind : 'edit',
    label: label ? String(label).slice(0, 60) : defaultLabel(kind, existing.length + 1),
    note: note ? String(note).slice(0, 400) : '',
    prompt: prompt ? String(prompt).slice(0, 500) : '',
    scribble: await compactScribble(scribble),
    strokes: sanitizeStrokes(strokes),
    document: document || null,
    createdAt: new Date().toISOString(),
  };

  const versions = [...existing, version].slice(-MAX_VERSIONS);
  const updated = await projects.update(projectId, { versions });
  if (!updated) return null;
  return { versions: versions.map(summarize), version: summarize(version) };
}

/**
 * Restore a version: its document becomes the project's current one.
 *
 * Restoring is itself non-destructive — the work being replaced is snapshotted
 * first, so stepping back to version 2 and disliking it still leaves version 5
 * exactly where it was. Nothing in this feature can lose work.
 */
export async function restoreVersion(projectId, versionId) {
  const project = await projects.get(projectId);
  if (!project) return null;

  const versions = project.versions || [];
  const target = versions.find((v) => v.id === versionId);
  if (!target) return { error: 'Version not found' };
  if (!target.document) return { error: 'That version has no design to restore' };

  let history = versions;

  // Snapshot the current state first, unless it is already identical to the
  // most recent version (restoring twice in a row should not stack up
  // duplicates of the same document).
  const last = versions[versions.length - 1];
  const currentIsSaved = last && JSON.stringify(last.document) === JSON.stringify(project.document);
  if (!currentIsSaved && (project.document?.elements || []).length) {
    history = [
      ...versions,
      {
        id: nanoid(),
        index: (last?.index || 0) + 1,
        kind: 'edit',
        label: 'Before restore',
        note: 'Saved automatically so restoring could not lose it.',
        prompt: '',
        scribble: null,
        document: project.document,
        createdAt: new Date().toISOString(),
      },
    ].slice(-MAX_VERSIONS);
  }

  const updated = await projects.update(projectId, { document: target.document, versions: history });
  if (!updated) return null;
  return { document: target.document, versions: history.map(summarize), restored: summarize(target) };
}

export async function removeVersion(projectId, versionId) {
  const project = await projects.get(projectId);
  if (!project) return null;
  const versions = (project.versions || []).filter((v) => v.id !== versionId);
  if (versions.length === (project.versions || []).length) return { error: 'Version not found' };
  const updated = await projects.update(projectId, { versions });
  if (!updated) return null;
  return { versions: versions.map(summarize) };
}

/* -------------------------------- internals ------------------------------- */

/**
 * Strokes as sent by the client, reduced to what can safely be stored and
 * handed back. Untrusted like anything else off the wire: the canvas will
 * replay these, so anything that is not a number does not survive.
 */
function sanitizeStrokes(strokes) {
  if (!Array.isArray(strokes) || !strokes.length) return null;
  const out = [];

  for (const stroke of strokes.slice(0, MAX_STROKES)) {
    const points = Array.isArray(stroke?.points) ? stroke.points : [];
    const clean = [];
    for (const point of points.slice(0, MAX_POINTS_PER_STROKE)) {
      const x = Number(point?.x);
      const y = Number(point?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const pressure = Number(point?.pressure);
      clean.push({ x, y, pressure: Number.isFinite(pressure) ? Math.min(1, Math.max(0, pressure)) : 0.5 });
    }
    if (!clean.length) continue;
    out.push({
      tool: ['pen', 'marker', 'eraser'].includes(stroke?.tool) ? stroke.tool : 'pen',
      color: /^#[0-9a-f]{3,8}$/i.test(String(stroke?.color || '')) ? stroke.color : '#111111',
      size: Math.min(200, Math.max(0.5, Number(stroke?.size) || 6)),
      // Coordinates arrive normalised to 0..1 (see the client's `snapshot`),
      // so a sketch drawn on a laptop restores correctly on a phone.
      points: clean,
    });
  }

  return out.length ? out : null;
}

function defaultLabel(kind, position) {
  if (kind === 'scribble') return 'Scribble';
  if (kind === 'generated') return position <= 2 ? 'Apollo design' : 'New direction';
  return `Version ${position}`;
}

/**
 * Store the sketch small.
 *
 * A drawing arrives at whatever size the canvas happened to be, which on a
 * large display is several megapixels of mostly-empty PNG. Downscaling to a
 * working resolution keeps a history of a dozen versions to a sensible size
 * while still being sharp enough to restore and keep drawing on. PNG is kept
 * (rather than WebP) because the sketch is transparent, and its transparency
 * is what lets the canvas show it back over the page's own ground.
 */
async function compactScribble(dataUrl) {
  const match = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/s.exec(String(dataUrl || ''));
  if (!match) return null;
  try {
    const input = Buffer.from(match[2], 'base64');
    const output = await sharp(input)
      .resize(SCRIBBLE_MAX_PX, SCRIBBLE_MAX_PX, { fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9, palette: true })
      .toBuffer();
    // A drawing that somehow got bigger is a drawing that was already small.
    const best = output.length < input.length ? output : input;
    return `data:image/png;base64,${best.toString('base64')}`;
  } catch (err) {
    console.warn(`[versions] could not compact the sketch (${err.message}) — storing as sent`);
    return dataUrl.length < 2_000_000 ? dataUrl : null;
  }
}
