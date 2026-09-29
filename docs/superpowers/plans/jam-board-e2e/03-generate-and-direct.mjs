// Generation with live progress, per-section rebuild (annotations stay attached), and Direct mode.
// Needs the scripted model: node fake-server.mjs, and the client proxied to it:
//   VITE_BACKEND_URL=http://127.0.0.1:5111 npm run dev --prefix client
import { SHOTS, start } from './harness.mjs';

const { page, check, ed, open, openBoard, finish } = await start();

/* -------------------------------- generation ---------------------------------- */
await open('/board');
const generate = page.getByRole('button', { name: 'Generate board' });
check('generate is disabled until there is a brief', await generate.isDisabled());
await page.locator('#brief').fill('YOUR WEBSITE IS LOSING YOU SALES. Chapter 1: the sale. Chapter 2: how they found you. Chapter 3: the click.');
check('generate enables with a brief and a live model', await generate.isEnabled());
await generate.click();
await page.getByText(/Drafting section \d+ of 12/).waitFor({ timeout: 8000 });
check('progress shows the sections as they are found', true);
await page.waitForURL(/\/board\/b_/, { timeout: 30000 });
await page.waitForFunction(() => window.__boardEditor, null, { timeout: 30000 });
await page.waitForTimeout(600);
const made = await ed(() => ({ sections: window.__boardEditor.getScene().sections.length, brief: window.__boardEditor.getState().brief.length }));
check('the generated board opens with 12 sections and remembers its brief', made.sections === 12 && made.brief > 40, JSON.stringify(made));
await open('/board');
await page.getByText('Your Website Is Losing You Sales').first().click();
await page.waitForFunction(() => window.__boardEditor, null, { timeout: 30000 });
await page.waitForTimeout(500);

/* ---------------------------------- Direct ------------------------------------ */
const bar = page.getByLabel('Direct mode instruction');
const openBar = async () => { await page.keyboard.press('/'); await bar.waitFor(); };
const say = async (text) => {
  await bar.fill(text);
  await page.keyboard.press('Enter');
  await page.locator('p.mt-2').first().waitFor({ timeout: 8000 });
  await page.waitForTimeout(150);
};
const closeBar = async () => { await bar.press('Escape'); await page.waitForTimeout(100); };
const snapshot = () => ed(() => { const s = window.__boardEditor.getState(); return JSON.stringify([s.spec, s.overrides, s.annotations, s.connections]); });

await ed(() => window.__boardEditor.goToSection(2));
await page.waitForTimeout(300);
await ed(() => window.__boardEditor.select(['s3.b2.n1']));

await openBar();
check('/ opens the command bar', await bar.isVisible());
await say('make this huge');
check('"make this huge" restyles the selection', (await ed(() => window.__boardEditor.getState().overrides['s3.b2.n1']?.style?.fontSize)) === 150);
check('the reply is shown', await page.getByText('Made it huge.').isVisible());
await closeBar();
await page.keyboard.press('Control+z');
check('one undo reverts the whole instruction', !(await ed(() => window.__boardEditor.getState().overrides['s3.b2.n1']?.style?.fontSize)));

await openBar();
await say('put the graph under the click');
const gaps = await ed(() => {
  const e = window.__boardEditor;
  const hub = e.boundsOf('s3.b3');
  const click = e.boundsOf('s3.b2.n1');
  return { hubTop: hub.y, clickBottom: click.y + click.h, hubCx: hub.x + hub.w / 2, clickCx: click.x + click.w / 2 };
});
check('"under the click" places the graph below it, centred, 60 apart', Math.abs(gaps.hubTop - (gaps.clickBottom + 60)) < 3 && Math.abs(gaps.hubCx - gaps.clickCx) < 3, JSON.stringify(gaps));
await page.screenshot({ path: `${SHOTS}/direct-moved.png` });
await closeBar();
await page.keyboard.press('Control+z');
check('that move undoes in one step', !(await ed(() => window.__boardEditor.getState().overrides['s3.b3'])));

await openBar();
const annBefore = await ed(() => window.__boardEditor.getState().annotations.length);
await say('circle the loading step');
const circle = await ed(() => {
  const e = window.__boardEditor;
  const a = e.getState().annotations.at(-1);
  const r = e.sync.objectOf(a.id).getBoundingRect(true, true);
  const t = e.boundsOf('s3.b2.n3');
  return { shape: a.json.type, stroke: a.json.stroke, overlaps: r.left < t.x + t.w && r.left + r.width > t.x && r.top < t.y + t.h && r.top + r.height > t.y };
});
check('"circle the loading step" draws a red ellipse around it', circle.shape === 'ellipse' && circle.overlaps && circle.stroke === '#c81e3a', JSON.stringify(circle));
check('as one new annotation', (await ed(() => window.__boardEditor.getState().annotations.length)) === annBefore + 1);

await say('draw a dashed arrow');
check('an arrow between two named things is a live connection', (await ed(() => window.__boardEditor.getState().connections.length)) === 1
  && (await ed(() => window.__boardEditor.canvas.getObjects().some((o) => o.data?.kind === 'connection'))));

const before = await snapshot();
await say('do something with the ghost');
check('an instruction that names something that does not exist changes nothing', (await snapshot()) === before);
check('and the model\'s sentence is shown', await page.getByText('Tried.').isVisible());

await say('rename the website step');
check('"rename" edits a label', (await ed(() => window.__boardEditor.getState().overrides['s3.b2.n2']?.text)) === 'YOUR SITE');
await say('insert a statement');
const blocks = await ed(() => window.__boardEditor.getState().spec.sections[2].blocks.map((b) => `${b.id}:${b.type}`));
check('a block is inserted with a fresh, stable id', blocks.length === 6 && blocks.includes('s3.b6:statement'), JSON.stringify(blocks));
await say('what is the weather');
check('an instruction it cannot do gets a sentence and no change', await page.getByText("I can't do that with these operations.").isVisible());
await closeBar();

/* ---------------------------- rebuilding one section ---------------------------- */
await ed(() => window.__boardEditor.dispatch({ type: 'ADD_TEXT', text: 'LATER', section: 's6', x: 700, y: 300 }));
await page.getByRole('button', { name: 'Sections' }).click();
const heightBefore = await ed(() => window.__boardEditor.getScene().sections[2].height);
await page.getByRole('button', { name: 'Rebuild section 3', exact: true }).click();
await page.getByPlaceholder(/Optional note/).fill('make it sparser');
await page.getByRole('button', { name: 'Rebuild', exact: true }).click();
await page.getByText(/Rebuilt "/).waitFor({ timeout: 10000 });
const after = await ed(() => {
  const e = window.__boardEditor;
  const rec = e.getState().annotations.find((a) => a.json.text === 'LATER');
  const sections = e.getScene().sections;
  return {
    blocks: e.getState().spec.sections[2].blocks.length,
    height: sections[2].height,
    fromSectionTop: e.sync.objectOf(rec.id).top - sections.find((s) => s.id === 's6').y,
    pieces: Object.keys(e.getState().overrides).filter((k) => k.startsWith('s3.')).length,
    connections: e.getState().connections.length,
    canUndo: e.canUndo(),
  };
});
check('rebuilding with a note replaces only that section', after.blocks === 1 && after.height < heightBefore, JSON.stringify(after));
check('its moved pieces and connections are reset', after.pieces === 0 && after.connections === 0);
check('an annotation in a LATER section stayed attached to its section', Math.abs(after.fromSectionTop - 300) < 1, String(after.fromSectionTop));
check('undo history starts afresh', after.canUndo === false);
await page.getByRole('button', { name: 'Close sections' }).click();

await page.getByRole('button', { name: /Start recording mode/ }).click();
await page.waitForTimeout(150);
await page.keyboard.press('/');
await page.waitForTimeout(200);
check('the command bar does not open in recording mode', (await bar.count()) === 0);

await finish();
