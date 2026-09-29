import exampleSpec from './example/website-is-losing-you-sales.json';
import { newBoardRecord, sanitizeSpec } from './state/boardRecord.js';

/** The bundled example lives under a fixed id so it is created once and then behaves like any other board. */
export const EXAMPLE_ID = 'example';

export function createExampleRecord() {
  return newBoardRecord({ id: EXAMPLE_ID, spec: sanitizeSpec(exampleSpec), brief: '' });
}

export const newBoardId = () => `b_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
