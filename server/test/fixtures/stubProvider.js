import { SAMPLES } from './boardSamples.js';

/** A stand-in for DeepSeek: records every call, answers with whatever `handler` returns. */
export function makeProvider(handler, { live = true } = {}) {
  const calls = [];
  return {
    live,
    model: 'stub',
    calls,
    async completeJSON(req) {
      calls.push(req);
      return handler(req, calls.length);
    },
  };
}

export const isOutline = (req) => !/Build section \d+ of/.test(req.user);
export const sectionIndex = (req) => Number(/Build section (\d+) of/.exec(req.user)[1]) - 1;
export const goodSection = () => ({ blocks: [SAMPLES.title, SAMPLES.flow] });
export const outlineOf = (n) => ({
  title: 'Board',
  audience: 'business owners',
  sections: Array.from({ length: n }, (_, i) => ({ title: `Section ${i + 1}`, beat: `beat ${i + 1}`, density: 3 })),
});
export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
