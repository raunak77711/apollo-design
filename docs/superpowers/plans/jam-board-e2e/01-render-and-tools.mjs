// Milestone 1 — the example board renders, scrolls and zooms; pieces move; every drawing tool works;
// undo/redo; persistence across a reload. Needs: npm run dev (no API key required).
import { SHOTS, start } from './harness.mjs';

const { page, check, ed, openBoard, screenOf, finish } = await start();
await openBoard('/board/example');

/* ------------------------------ render and camera ------------------------------ */
const info = await ed(() => {
  const e = window.__boardEditor;
  return { sections: e.getScene().sections.length, objects: e.canvas.getObjects().length, zoom: e.viewport.view.zoom, w: e.canvas.getWidth() };
});
check('the example renders twelve sections', info.sections === 12 && info.objects > 200, JSON.stringify(info));
check('the board fits the window width on open', Math.abs(info.zoom - info.w / 1400) < 0.01);
await page.screenshot({ path: `${SHOTS}/01-top.png` });

await ed(() => window.__boardEditor.viewport.reset());
await page.mouse.move(800, 450);
await page.mouse.wheel(0, 700);
await page.waitForTimeout(600);
check('the wheel scrolls the board', (await ed(() => window.__boardEditor.viewport.view.y)) < -600);
const z0 = await ed(() => window.__boardEditor.viewport.view.zoom);
await page.keyboard.down('Control');
await page.mouse.wheel(0, -300);
await page.keyboard.up('Control');
await page.waitForTimeout(200);
check('Ctrl+wheel zooms', (await ed(() => window.__boardEditor.viewport.view.zoom)) > z0);
for (const i of [2, 6, 10, 11]) {
  await ed((n) => window.__boardEditor.goToSection(n), i);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${SHOTS}/section-${i + 1}.png` });
}

/* ------------------------------- moving a piece -------------------------------- */
await ed(() => window.__boardEditor.viewport.reset());
await ed(() => window.__boardEditor.goToSection(2));
await page.waitForTimeout(300);
const p0 = await screenOf('s3.b2.n2');
await page.mouse.move(p0.x, p0.y);
await page.mouse.down();
await page.mouse.move(p0.x + 200, p0.y + 40, { steps: 8 });
const live = await ed(() => {
  const e = window.__boardEditor;
  const item = e.getScene().items.find((i) => i.kind === 'connector' && i.to === 's3.b2.n2');
  return e.canvas.getObjects().find((o) => o.type === 'lineArrow' && o.data?.id === item.id)?.getEndpoints();
});
await page.mouse.up();
const moved = await ed(() => window.__boardEditor.getState().overrides['s3.b2.n2']);
check('dragging a piece stores an override', moved && moved.dx > 100, JSON.stringify(moved));
check('its connector followed during the drag', Boolean(live), JSON.stringify(live));
await page.keyboard.press('Control+z');
check('undo takes the move back', !(await ed(() => window.__boardEditor.getState().overrides['s3.b2.n2'])?.dx));
await page.keyboard.press('Control+Shift+z');
check('redo puts it back', (await ed(() => window.__boardEditor.getState().overrides['s3.b2.n2']?.dx)) > 100);

/* --------------------------------- the tools ----------------------------------- */
const kinds = () => ed(() => window.__boardEditor.getState().annotations.map((a) => a.kind));
await page.keyboard.press('p');
await page.mouse.move(700, 300);
await page.mouse.down();
for (let i = 0; i <= 20; i += 1) await page.mouse.move(700 + i * 10, 300 + Math.sin(i / 2) * 30);
await page.mouse.up();
check('pen', (await kinds()).includes('path'));

await page.keyboard.press('m');
await page.mouse.move(600, 500);
await page.mouse.down();
await page.mouse.move(900, 505, { steps: 10 });
await page.mouse.up();
check('highlighter', (await kinds()).includes('highlight'));

await page.keyboard.press('r');
await page.mouse.move(300, 550);
await page.mouse.down();
await page.mouse.move(500, 680, { steps: 6 });
await page.mouse.up();
check('rectangle, then the tool returns to select', (await ed(() => window.__boardEditor.tools.name)) === 'select');
await page.keyboard.press('c');
await page.mouse.move(1000, 550);
await page.mouse.down();
await page.mouse.move(1200, 680, { steps: 6 });
await page.mouse.up();

await page.keyboard.press('a');
const a1 = await screenOf('s3.b2.n1');
const a3 = await screenOf('s3.b2.n3');
await page.mouse.move(a1.x + 160, a1.y - 4);
await page.mouse.down();
await page.mouse.move(a3.x + 150, a3.y + 6, { steps: 8 });
await page.mouse.up();
check('arrow', (await kinds()).includes('arrow'));

await page.keyboard.press('t');
await page.mouse.click(800, 200);
await page.keyboard.type('THIS IS THE LEAK');
await page.mouse.click(1400, 120);
await page.waitForTimeout(200);
check('text', await ed(() => window.__boardEditor.getState().annotations.some((a) => a.json.text === 'THIS IS THE LEAK')));

await page.keyboard.press('t');
await page.mouse.click(400, 250);
await page.keyboard.type('rectangle pen eraser');
const typed = await ed(() => ({ tool: window.__boardEditor.tools.name, text: window.__boardEditor.canvas.getActiveObject()?.text }));
check('shortcut letters type into a text box instead of switching tools', typed.tool === 'text' && typed.text === 'rectangle pen eraser', JSON.stringify(typed));
await page.mouse.click(1450, 130);

await page.keyboard.press('n');
await page.mouse.click(300, 320);
await page.keyboard.type('remember this');
await page.mouse.click(1450, 140);
check('sticky note', (await kinds()).includes('sticky'));
await page.screenshot({ path: `${SHOTS}/02-annotated.png` });

const before = (await kinds()).length;
await page.keyboard.press('e');
await page.mouse.move(690, 310);
await page.mouse.down();
await page.mouse.move(920, 300, { steps: 20 });
await page.mouse.up();
check('the eraser removes what it touches', (await kinds()).length < before);
check('and never a piece of the deck', Object.values(await ed(() => window.__boardEditor.getState().overrides)).every((o) => !o.deleted));

await page.keyboard.press('v');
const w = await screenOf('s3.b2.n1');
await page.mouse.click(w.x, w.y);
await page.keyboard.press('Delete');
check('Delete hides a selected piece', await ed(() => window.__boardEditor.getState().overrides['s3.b2.n1']?.deleted === true));
await page.keyboard.press('Control+z');
check('and undo restores it', await ed(() => !window.__boardEditor.getState().overrides['s3.b2.n1']?.deleted));

/* -------------------------------- persistence ---------------------------------- */
await page.waitForTimeout(1200);
const saved = await ed(() => window.__boardEditor.getState().annotations.length);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__boardEditor, null, { timeout: 30000 });
await page.waitForTimeout(600);
const after = await ed(() => ({
  anns: window.__boardEditor.getState().annotations.length,
  onCanvas: window.__boardEditor.canvas.getObjects().filter((o) => o.data?.kind === 'annotation').length,
  dx: window.__boardEditor.getState().overrides['s3.b2.n2']?.dx,
}));
check('annotations survive a reload', after.anns === saved && after.onCanvas === saved, JSON.stringify(after));
check('a moved piece survives a reload', after.dx > 100);
await page.screenshot({ path: `${SHOTS}/03-reloaded.png` });

await finish();
