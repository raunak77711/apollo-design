import { getAIProvider } from './ai/index.js';
import { resolveImageUrl } from './images/index.js';
import { validateOperation, applyOperations } from '../design/operations.js';

/**
 * Orchestrates an AI edit request:
 *  1. Ask the provider for operations.
 *  2. Resolve any image `query` fields into real photo URLs.
 *  3. Validate every operation (AI output is untrusted).
 *  4. Return validated operations + a preview document.
 *
 * The client applies the returned operations through the SAME operation system
 * used for manual edits, creating a single undoable history entry.
 */
export async function runAIEdit({ message, document, selectedElementId }) {
  const provider = getAIProvider();
  const { operations: raw, message: reply } = await provider.generateOperations({
    message,
    document,
    selectedElementId,
  });

  const operations = [];
  for (const op of raw) {
    const resolved = await resolveImageQueries(op);
    const { ok } = validateOperation(resolved);
    if (ok) operations.push(resolved);
  }

  // Compute a preview document so the server can validate the end state.
  const { document: preview, skipped } = applyOperations(document, operations);

  return { operations, message: reply, preview, skipped };
}

async function resolveImageQueries(op) {
  if (op.type === 'CREATE_ELEMENT' && op.element?.type === 'image') {
    const el = { ...op.element, properties: { ...op.element.properties } };
    const query = el.query || el.properties?.query;
    if (query && !el.properties.src) {
      el.properties.src = await resolveImageUrl(query);
      el.properties.alt = el.properties.alt || query;
    }
    delete el.query;
    delete el.properties.query;
    return { ...op, element: el };
  }
  // UPDATE with an image query (e.g. "replace the hero image").
  if ((op.type === 'UPDATE_ELEMENT' || op.type === 'SET_CONTENT') && op.changes?.query) {
    const changes = { ...op.changes };
    changes.src = await resolveImageUrl(changes.query);
    delete changes.query;
    return { ...op, changes };
  }
  return op;
}
