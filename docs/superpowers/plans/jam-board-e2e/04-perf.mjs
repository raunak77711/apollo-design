// Scale check: a 20-section board (the example's 12 sections plus its first 8 again).
// Prints timings; the pass/fail thresholds are deliberately generous — the point is to catch a regression
// like "every drag re-renders 2,000 objects", not to benchmark the machine.
import { start } from './harness.mjs';

const { page, check, ed, open, finish } = await start();
await open('/board');
const id = await ed(async () => {
  const records = await import('/src/components/board/state/boardRecord.js');
  const { boardStore } = await import('/src/components/board/boardStore.js');
  const { createExampleRecord } = await import('/src/components/board/exampleBoard.js');
  const base = createExampleRecord().spec;
  // Repeated section ids make sanitizeSpec renumber everything, which is exactly what a fresh board would get.
  const spec = records.sanitizeSpec({ ...base, sections: [...base.sections, ...base.sections.slice(0, 8)] });
  const record = records.newBoardRecord({ id: 'b_perf', spec, brief: '' });
  await boardStore.put(record);
  return record.id;
});
await open(`/board/${id}`);
await page.waitForFunction(() => window.__boardEditor, null, { timeout: 60000 });
await page.waitForTimeout(800);

const r = await ed(async () => {
  const e = window.__boardEditor;
  const avg = (fn, n = 20) => { const t0 = performance.now(); for (let i = 0; i < n; i += 1) fn(); return (performance.now() - t0) / n; };
  const out = { sections: e.getScene().sections.length, objects: e.canvas.getObjects().length };
  e.viewport.reset();
  out.renderFitMs = avg(() => e.canvas.renderAll());
  e.viewport.set({ zoom: 0.25, x: 0, y: 0 });
  out.renderWholeBoardMs = avg(() => e.canvas.renderAll());
  e.goToSection(10);
  out.dragStepMs = avg(() => { e.renderer.updateConnectors(); e.canvas.renderAll(); });
  const t0 = performance.now();
  e.dispatch({ type: 'MOVE', targets: ['s11.b2'], dx: 40, dy: 10 });
  out.dispatchMoveMs = performance.now() - t0;
  const t1 = performance.now();
  e.undo();
  out.undoMs = performance.now() - t1;
  e.viewport.reset();
  const frames = await new Promise((resolve) => {
    const times = [];
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      times.push(now - last);
      last = now;
      e.viewport.panBy(0, -40);
      if (times.length < 90) requestAnimationFrame(tick);
      else resolve(times);
    };
    requestAnimationFrame(tick);
  });
  out.scrollFrameAvgMs = frames.reduce((a, b) => a + b, 0) / frames.length;
  out.scrollFrameMaxMs = Math.max(...frames);
  return out;
});
console.log(JSON.stringify(r, null, 2));
check('a 20-section board builds', r.sections === 20 && r.objects > 300);
check('a full render is well under a frame budget at fit zoom', r.renderFitMs < 30, `${r.renderFitMs.toFixed(1)}ms`);
check('even zoomed all the way out', r.renderWholeBoardMs < 120, `${r.renderWholeBoardMs.toFixed(1)}ms`);
check('a drag step (connectors + render) stays interactive', r.dragStepMs < 40, `${r.dragStepMs.toFixed(1)}ms`);
check('a dispatched move and its undo are instant', r.dispatchMoveMs < 150 && r.undoMs < 150, `${r.dispatchMoveMs.toFixed(0)}ms / ${r.undoMs.toFixed(0)}ms`);
check('scrolling keeps frames short', r.scrollFrameAvgMs < 34, `${r.scrollFrameAvgMs.toFixed(1)}ms avg, ${r.scrollFrameMaxMs.toFixed(0)}ms worst`);

await finish();
