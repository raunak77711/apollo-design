// Content Factory - upload a recording, link a Jam board, process, read the tally, seek the video.
// Needs: the Docker backend (npm run whisper:worker running on the host), the Vite dev server
//   BASE_URL=http://127.0.0.1:5299 node 05-content-factory.mjs
// and a sample recording at server/whisper/samples/sample_short.mp4 (see server/whisper/samples/make_sample.ps1).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHOTS, start } from './harness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE = path.resolve(here, '../../../../server/whisper/samples/sample_short.mp4');

const { page, check, ed, open, finish } = await start();

/* A board that talks about the sample recording, saved the way the Jam board page saves one. */
await open('/board');
await ed(async () => {
  const rec = await import('/src/components/board/state/boardRecord.js');
  const { boardStore } = await import('/src/components/board/boardStore.js');
  const spec = rec.sanitizeSpec({
    title: 'HVAC leads',
    sections: [
      { title: 'THE MYTH', blocks: [{ type: 'title', text: 'MORE TRAFFIC?' }, { type: 'statement', text: 'Most HVAC owners think they need more website traffic.' }] },
      { title: 'MEET SARAH', blocks: [{ type: 'moment', text: 'SARAH', icon: 'user', chips: [{ label: '8:32 PM' }, { label: 'AC STOPS WORKING' }] }] },
      { title: 'FOUR COMPANIES', blocks: [{ type: 'flow', direction: 'down', steps: ['SARAH', 'GOOGLE', 'COMPANY A', 'COMPANY B'] }] },
      { title: 'WHY SHE LEAVES', blocks: [{ type: 'cards', items: ['SLOW SITE', 'NO PHONE NUMBER', 'LONG FORM', 'FAST ANSWER'] }] },
      { title: 'THE LEAK', blocks: [{ type: 'bigtype', text: 'THE LEAK' }, { type: 'statement', text: 'The leak happens between the website and the lead.' }] },
      { title: 'NOT IN THE VIDEO', blocks: [{ type: 'statement', text: 'Kubernetes pricing for dolphins' }] },
    ],
  });
  await boardStore.put(rec.newBoardRecord({ id: 'b_content_e2e', spec, brief: 'x'.repeat(60) }));
});

/* ---------------------------------- the page --------------------------------- */
await open('/content');
check('the Content link is in the header', await page.getByRole('link', { name: 'Content', exact: true }).first().isVisible());
check('the page has its title', await page.getByRole('heading', { name: 'Content Factory' }).isVisible());

await page.getByRole('button', { name: 'New recording' }).click();
await page.waitForURL(/\/content\/[a-z0-9]{12}$/);
const sessionId = page.url().split('/').pop();
check('a new recording opens its own page', Boolean(sessionId));
check('Process video is disabled until there is a video', await page.getByRole('button', { name: 'Process video' }).isDisabled());
check('every status starts as not started', (await page.getByText('Not started').count()) >= 3);

/* ---------------------------------- upload ----------------------------------- */
await page.locator('input[type="file"]').setInputFiles(SAMPLE);
await page.waitForSelector('video', { timeout: 30000 });
check('the uploaded video appears in a player', await page.locator('video').isVisible());
check('its file name is shown', await page.getByText('sample_short.mp4').isVisible());
check('Process video is now enabled', await page.getByRole('button', { name: 'Process video' }).isEnabled());

/* ----------------------------- link the Jam board ---------------------------- */
const select = page.locator('#content-board');
check('the saved board is offered', (await select.locator('option', { hasText: 'HVAC leads' }).count()) === 1);
await select.selectOption('b_content_e2e');
await page.getByText(/6 sections, \d+ spoken parts linked/).waitFor({ timeout: 10000 });
check('linking a board reports what was read from it', true);
check('the bundled example is offered too', (await select.locator('option', { hasText: 'Example board' }).count()) === 1);

/* ----------------------------------- process --------------------------------- */
await page.getByRole('button', { name: 'Process video' }).click();
await page.getByRole('button', { name: /Processing/ }).waitFor({ timeout: 10000 });
check('the button shows it is working', true);
await page.getByRole('button', { name: 'Processed' }).waitFor({ timeout: 180000 });
check('processing completes', true);
check('transcription reports words, model and device', await page.getByText(/words - large-v3-turbo on (cuda|cpu)/).isVisible());
await page.getByRole('heading', { name: 'Board tally' }).waitFor({ timeout: 15000 });
check('the board tally appears', true);

/* ----------------------------------- the tally ------------------------------- */
check('every board section is listed', (await page.getByText('Not spoken in this video').count()) === 1);
check('a section absent from the video says so', await page.locator('li', { hasText: 'Kubernetes pricing for dolphins' }).getByText('Not spoken in this video').isVisible());
check('the summary counts found sections', await page.getByText(/5 of 6 sections/).isVisible());

const leak = page.locator('li', { hasText: 'Section 5' }).first(); // THE LEAK
await leak.locator('button').first().click();
check('a section opens to the exact parts that were spoken', await page.getByText(/% of its words spoken/).first().isVisible());

// A timestamp seeks the video.
const chip = leak.locator('button.font-mono').first();
const label = (await chip.innerText()).trim();
const [m, s] = label.split('-')[0].split(':').map(Number);
await chip.click();
await page.waitForTimeout(600);
const at = await page.locator('video').evaluate((v) => v.currentTime);
check('clicking a timestamp seeks the video there', Math.abs(at - (m * 60 + s)) < 3, `chip ${label} -> video at ${at.toFixed(1)}s`);

// The transcript.
await page.getByRole('button', { name: 'Transcript' }).click();
await page.getByText(/Most HVAC owners think they need more website traffic/).first().waitFor({ timeout: 10000 });
check('the transcript lists what was said, with times', true);
await page.screenshot({ path: path.join(SHOTS, 'content-session.png'), fullPage: true });

/* ----------------------------- persistence + the list ------------------------ */
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Processed' }).waitFor({ timeout: 10000 });
check('a reload keeps the session, video, board and tally', await page.getByRole('heading', { name: 'Board tally' }).isVisible());

await open('/content');
check('the recording is listed with its state', await page.getByText(/Transcribed - HVAC leads/).first().isVisible());
await page.screenshot({ path: path.join(SHOTS, 'content-list.png') });

/* ----------------------------- existing pages still work --------------------- */
await open('/board');
check('the Jam board page still loads', await page.getByRole('heading', { name: 'Jam board' }).isVisible());
await open('/');
check('the home page still loads', (await page.locator('body').innerText()).length > 50);

// tidy up what this run created
await page.evaluate((id) => fetch(`/api/content/sessions/${id}`, { method: 'DELETE' }), sessionId);
await ed(async () => {
  const { boardStore } = await import('/src/components/board/boardStore.js');
  await boardStore.remove('b_content_e2e');
});
await finish();
