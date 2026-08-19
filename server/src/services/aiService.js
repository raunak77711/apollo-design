import { getAIProvider } from './ai/index.js';
import { resolveImageUrl } from './images/index.js';
import { getOpenRouterProvider } from './images/OpenRouterProvider.js';
import { validateOperation, applyOperations } from '../design/operations.js';
import { buildDesign, buildVariations } from './designService.js';

/**
 * The AI entry point, which routes a request down one of two very different
 * paths:
 *
 *  - "design me something"  → the generation pipeline (art direction →
 *    photography → composition → critique). The model never places elements.
 *  - "change this thing"    → the operation path, where the model edits the
 *    existing document directly.
 *
 * Both return validated operations that the client applies through the same
 * operation system used for manual edits, so anything Apollo makes is one
 * undoable step and stays editable by hand.
 */
export async function runAIEdit({ message, document, selectedElementId }) {
  if (wantsNewDesign(message, document)) {
    const result = await buildDesign({ message, document });
    const operations = result.operations.filter((op) => validateOperation(op).ok);
    const { document: preview, skipped } = applyOperations(document, operations);
    return {
      operations,
      message: result.message,
      preview,
      skipped,
      // Surfaced so the editor can show what Apollo decided, and why.
      direction: summary(result),
    };
  }

  const provider = getAIProvider();
  const { operations: raw, message: reply } = await provider.generateOperations({
    message,
    document,
    selectedElementId,
  });

  const operations = [];
  for (const op of raw) {
    const resolved = await resolveImageQueries(op, document);
    if (validateOperation(resolved).ok) operations.push(resolved);
  }

  const { document: preview, skipped } = applyOperations(document, operations);
  return { operations, message: reply, preview, skipped };
}

/** Three genuinely different directions for the same brief. */
export async function runVariations({ message, document }) {
  const directions = await buildVariations({ message, document });
  return {
    directions: directions.map((direction) => ({
      ...direction,
      operations: direction.operations.filter((op) => validateOperation(op).ok),
    })),
  };
}

/**
 * Generation is the right path when there is nothing to edit, or when the ask
 * is plainly for a new design rather than a change to the current one.
 */
function wantsNewDesign(message = '', document) {
  if (!(document?.elements || []).length) return true;
  const text = message.toLowerCase();
  if (/\b(redesign|start over|start again|from scratch|regenerate|try again|another design|different design|new design|new version)\b/.test(text)) return true;

  const creates = /\b(create|design|make|generate|build)\b/.test(text);
  // "make it bigger" is an edit; "make an instagram post" is a design.
  const edits = /\b(it|this|that|the (headline|title|button|text|image|photo|background|colour|color)|bigger|smaller|move|change|replace|delete|remove|swap|instead)\b/.test(text);
  return creates && !edits;
}

function summary(result) {
  return {
    style: result.brief.styleRef.label,
    layout: result.brief.layout,
    mood: result.brief.mood,
    palette: result.brief.palette,
    score: result.review.score,
    fixed: result.review.fixed.map((i) => i.message),
    outstanding: result.review.outstanding.map((i) => i.message),
  };
}

/**
 * Bespoke art first, stock photography as the fallback — the same order the
 * generation pipeline uses for a scribble hero, applied here to any edit that
 * asks for new imagery ("make the background a starry night"), not just a
 * literal photo swap. Falls straight through to `resolveImageUrl` (which has
 * its own placeholder fallback) on any failure or when no key is configured.
 */
async function resolveImage(query, { width, height } = {}) {
  const generator = getOpenRouterProvider();
  if (generator.configured) {
    try {
      const result = await generator.generateImage({ prompt: query, width, height });
      if (result) return `data:${result.mimeType};base64,${result.buffer.toString('base64')}`;
    } catch (err) {
      console.warn(`[ai] bespoke image generation failed for "${query}": ${err.message}`);
    }
  }
  return resolveImageUrl(query);
}

async function resolveImageQueries(op, document) {
  if (op.type === 'CREATE_ELEMENT' && op.element?.type === 'image') {
    const el = { ...op.element, properties: { ...op.element.properties } };
    const query = el.query || el.properties?.query;
    if (query && !el.properties.src) {
      el.properties.src = await resolveImage(query, { width: el.width, height: el.height });
      el.properties.alt = el.properties.alt || query;
    }
    delete el.query;
    delete el.properties.query;
    return { ...op, element: el };
  }
  if ((op.type === 'UPDATE_ELEMENT' || op.type === 'SET_CONTENT') && op.changes?.query) {
    const target = document?.elements?.find((e) => e.id === op.targetId);
    const changes = { ...op.changes };
    changes.src = await resolveImage(changes.query, { width: target?.width, height: target?.height });
    delete changes.query;
    return { ...op, changes };
  }
  return op;
}
