// Milestone 1 — property panel, images (upload, drop, downscale, refusal), section rail, help,
// save / clear / load, reset layout, recording mode. Needs: npm run dev (no API key required).
import fs from 'node:fs';
import { SHOTS, start } from './harness.mjs';

const { page, check, ed, openBoard, screenOf, finish } = await start({ acceptDownloads: true });
await openBoard('/board/example');

/* ------------------------------- property panel -------------------------------- */
await page.keyboard.press('t');
await page.mouse.click(800, 300);
await page.keyboard.type('HELLO');
await page.mouse.click(1450, 130);
await page.waitForTimeout(150);
const textId = await ed(() => window.__boardEditor.getState().annotations[0].id);
await ed((id) => window.__boardEditor.select([id]), textId);
await page.waitForTimeout(150);
const obj = (prop) => ed(([id, p]) => window.__boardEditor.sync.objectOf(id)[p], [textId, prop]);
check('the panel appears for a selected text box', await page.getByText('Text', { exact: true }).first().isVisible());
const size = page.locator('input[aria-label="Font size"]');
await size.fill('120');
await size.press('Enter');
await page.waitForTimeout(100);
check('font size applies live', (await obj('fontSize')) === 120);
await page.getByRole('button', { name: 'Italic' }).click();
check('italic', (await obj('fontStyle')) === 'italic');
await page.getByRole('button', { name: 'money', exact: true }).click();
check('a tone swatch recolours', (await obj('fill')) === '#0f7a3c');
await page.locator('select[aria-label="Font"]').selectOption('Source Serif 4');
check('font family', (await obj('fontFamily')) === 'Source Serif 4');

await ed(() => window.__boardEditor.goToSection(0));
await page.waitForTimeout(200);
await ed(() => window.__boardEditor.select(['s1.b1.text']));
await page.waitForTimeout(150);
await page.getByRole('button', { name: 'problem', exact: true }).click();
await page.waitForTimeout(150);
check('a deck title can be recoloured (an override)', (await ed(() => window.__boardEditor.getState().overrides['s1.b1.text']?.style?.color)) === 'problem');
check('and it stays selected', (await ed(() => window.__boardEditor.getSelection().map((s) => s.id).join())) === 's1.b1.text');
await page.keyboard.press('Control+z');
await page.waitForTimeout(150);
check('undo restores the original colour', (await ed(() => window.__boardEditor.renderer.objectOf('s1.b1.text').fill)) === '#0a0a0a');

await ed(() => window.__boardEditor.deselect());
await page.keyboard.press('p');
await page.waitForTimeout(150);
check('a drawing tool with nothing selected offers defaults', await page.getByText('New pen').isVisible());
await page.getByRole('button', { name: 'movement', exact: true }).click();
check('the default colour is remembered', (await ed(() => window.__boardEditor.defaults.get().color)) === 'movement');
await page.keyboard.press('v');

/* ---------------------------------- images ------------------------------------- */
const png = await ed(async () => {
  const c = document.createElement('canvas');
  c.width = 2400;
  c.height = 1200;
  const g = c.getContext('2d');
  g.fillStyle = '#2244aa';
  g.fillRect(0, 0, 2400, 1200);
  g.fillStyle = '#fff';
  g.font = '200px sans-serif';
  g.fillText('SCREENSHOT', 300, 650);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
});
await ed(() => window.__boardEditor.viewport.reset());
const fileInput = page.locator('input[type=file][accept*="image"]');
await fileInput.setInputFiles({ name: 'shot.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
await page.waitForFunction(() => window.__boardEditor.getState().annotations.some((a) => a.kind === 'image'), null, { timeout: 8000 });
const image = await ed(() => {
  const e = window.__boardEditor;
  const rec = e.getState().annotations.find((a) => a.kind === 'image');
  return { src: rec.json.src, isAsset: e.getState().assets[rec.json.src.replace('asset:', '')]?.startsWith('data:image/'), selected: e.getSelection().length };
});
check('an uploaded image is an annotation backed by an asset, and selected', image.src.startsWith('asset:') && image.isAsset && image.selected === 1, JSON.stringify(image));
const dims = await ed(() => new Promise((resolve) => {
  const e = window.__boardEditor;
  const rec = e.getState().annotations.find((a) => a.kind === 'image');
  const im = new Image();
  im.onload = () => resolve([im.naturalWidth, im.naturalHeight]);
  im.src = e.getState().assets[rec.json.src.replace('asset:', '')];
}));
check('a 2400px upload is stored at 1600', dims[0] === 1600 && dims[1] === 800, JSON.stringify(dims));

await ed(() => window.__boardEditor.goToSection(7));
await page.waitForTimeout(300);
const body = await screenOf('s8.b3.body');
await ed(async ({ x, y, b64 }) => {
  const file = new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'drop.png', { type: 'image/png' });
  const dt = new DataTransfer();
  dt.items.add(file);
  const host = document.querySelector('canvas.upper-canvas').parentElement.parentElement;
  host.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y }));
  host.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y }));
}, { x: body.x, y: body.y, b64: png });
await page.waitForFunction(() => window.__boardEditor.getState().annotations.filter((a) => a.kind === 'image').length === 2, null, { timeout: 8000 });
const fitted = await ed(() => {
  const e = window.__boardEditor;
  const last = e.getState().annotations.filter((a) => a.kind === 'image').at(-1);
  const r = e.sync.objectOf(last.id).getBoundingRect(true, true);
  const b = e.boundsOf('s8.b3.body');
  return r.left >= b.x - 1 && r.top >= b.y - 1 && r.left + r.width <= b.x + b.w + 1 && r.top + r.height <= b.y + b.h + 1;
});
check('an image dropped on a browser frame fits inside it', fitted);
await page.screenshot({ path: `${SHOTS}/frame.png` });
await fileInput.setInputFiles({ name: 'x.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') });
await page.waitForTimeout(400);
check('a GIF is refused with a message', await page.getByText('Please add a PNG, JPG or WebP image.').isVisible());

/* ------------------------------- chrome and files ------------------------------ */
await page.keyboard.press('?');
await page.waitForTimeout(150);
check('? opens the controls dialog', await page.getByRole('heading', { name: 'Controls' }).isVisible());
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
check('Escape closes it', (await page.getByRole('heading', { name: 'Controls' }).count()) === 0);

await page.getByRole('button', { name: 'Sections' }).click();
check('rebuild is disabled on a board with no brief', await page.getByRole('button', { name: 'Rebuild section 1', exact: true }).isDisabled());
await page.getByText("THE CUSTOMER DOESN'T WANT YOUR WEBSITE").click();
await page.waitForTimeout(300);
check('the section rail jumps to a section', (await ed(() => window.__boardEditor.currentSectionIndex())) === 4);
await page.getByRole('button', { name: 'Close sections' }).click();

const annotations = await ed(() => window.__boardEditor.getState().annotations.length);
const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save to a file' }).click()]);
const savePath = await download.path();
const saved = JSON.parse(fs.readFileSync(savePath, 'utf8'));
check('Save writes an apollo-board file', saved.format === 'apollo-board' && saved.board.annotations.length === annotations, download.suggestedFilename());
await page.getByRole('button', { name: 'Clear my annotations' }).first().click();
check('Clear removes annotations and nothing else', (await ed(() => window.__boardEditor.getState().annotations.length)) === 0 && (await ed(() => window.__boardEditor.canvas.getObjects().length)) > 200);
await page.locator('input[type=file][accept*="json"]').setInputFiles(savePath);
await page.waitForTimeout(800);
check('Load restores them', (await ed(() => window.__boardEditor.getState().annotations.length)) === annotations);

await ed(() => window.__boardEditor.dispatch({ type: 'MOVE', targets: ['s1.b1.text'], dx: 50, dy: 50 }));
await page.getByRole('button', { name: 'Reset layout' }).click();
check('Reset layout clears piece overrides', Object.keys(await ed(() => window.__boardEditor.getState().overrides)).length === 0);

/* ------------------------------- recording mode -------------------------------- */
await page.getByRole('button', { name: /Start recording mode/ }).click();
await page.waitForTimeout(200);
check('recording mode hides the file cluster', (await page.getByRole('button', { name: 'Save to a file' }).count()) === 0);
check('and keeps the toolbar', await page.getByRole('button', { name: 'Pen' }).isVisible());
check('and shows the section pill', await page.getByText(/^\d+ \/ 12 — /).isVisible());
await ed(() => window.__boardEditor.goToSection(3));
await page.waitForTimeout(300);
check('the pill follows the scroll', await page.getByText('4 / 12 — THEY FINALLY SEE THE WEBSITE').isVisible());
await page.screenshot({ path: `${SHOTS}/recording.png` });
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
check('Escape leaves recording mode', (await page.getByRole('button', { name: 'Save to a file' }).count()) === 1);

await finish();
