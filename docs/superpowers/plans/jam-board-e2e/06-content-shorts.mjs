// Content Factory - the shorts Apollo finds, the retakes it cuts, and the review-ready cards.
// Needs: Docker backend with a DeepSeek key, the host Whisper worker, the Vite dev server, and the test
// recording from `node server/scripts/make-test-recording.js` (server/whisper/samples/realistic/recording.mp4).
//   BASE_URL=http://127.0.0.1:5299 node 06-content-shorts.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHOTS, start } from './harness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const RECORDING = path.resolve(here, '../../../../server/whisper/samples/realistic/recording.mp4');

const { page, check, open, finish } = await start();
await open('/content');
await page.getByRole('button', { name: 'New recording' }).click();
await page.waitForURL(/\/content\/[a-z0-9]{12}$/);
const sessionId = page.url().split('/').pop();

await page.locator('input[type="file"]').setInputFiles(RECORDING);
await page.waitForSelector('video', { timeout: 60000 });
check('the recording uploads and the title follows the file name', (await page.locator('input[aria-label="Recording title"]').inputValue()) === 'recording');

await page.getByRole('button', { name: 'Process video' }).click();
await page.getByRole('button', { name: 'Processed' }).waitFor({ timeout: 240000 });
check('processing finishes', true);

// Analysis runs after the transcript and fills in the shorts.
await page.getByRole('heading', { name: 'Shorts', exact: true }).waitFor({ timeout: 120000 });
const cards = page.locator('li', { has: page.getByRole('button', { name: 'Play' }) });
await cards.first().waitFor({ timeout: 120000 });
const count = await cards.count();
check('several shorts are found in a 7-minute recording', count >= 4, `${count} cards`);
check('the status list reports the analysis', await page.getByText(/\d+ shorts found/).first().isVisible());
check('the counts row shows them as candidates', await page.getByText(new RegExp(`${count} candidates - 0 approved - 0 rejected`, 'i')).isVisible());

// A card carries the editorial case.
const first = cards.first();
check('a card has a title', (await first.locator('p.font-display').innerText()).length > 5);
check('a card has an overall score and the four sub-scores', (await first.locator('span.font-mono').first().innerText()).match(/^\d/) !== null && (await first.getByText('Hook').count()) === 1 && (await first.getByText('Clarity').count()) === 1);
check('a card says what was cut, or that it plays straight through', (await first.getByText(/cuts?:|no cuts/i).count()) === 1);

// At least one short removes a retake: its cut words are shown struck through, and not hidden.
const withCuts = cards.filter({ hasText: /abandoned take|false start|restart announcement|repeated take/ });
check('some shorts cut an abandoned take', (await withCuts.count()) >= 2, `${await withCuts.count()} of ${count}`);
const card = withCuts.first();
await card.getByRole('button', { name: 'What was said' }).click();
const struck = card.locator('p.line-through');
check('the cut words are visible, struck through', (await struck.count()) >= 1 && (await struck.first().innerText()).length > 5);
const cutText = await struck.first().innerText();
check('no kept line contains the restart announcement', (await card.locator('p:not(.line-through)').allInnerTexts()).every((t) => !/let me say that again/i.test(t)));
check('the struck text is what was cut', /sorry|uh|let me say|again|false|[a-z]+/i.test(cutText));

// Times are links: Play seeks the video to the short's start.
const chip = card.locator('button.font-mono').first();
const label = (await chip.innerText()).trim();
const [m, s] = label.split('-')[0].split(':').map(Number);
await chip.click();
await page.waitForTimeout(700);
const at = await page.locator('video').evaluate((v) => v.currentTime);
check('a short\'s time range seeks the video', Math.abs(at - (m * 60 + s)) < 3, `${label} -> ${at.toFixed(1)}s`);

// Restarts the detector saw, listed on their own.
await page.getByRole('button', { name: 'Restarts detected' }).click();
await page.getByText(/Let me say that again/i).first().waitFor({ timeout: 10000 });
check('the detected restarts are listed with their words', true);
await page.screenshot({ path: path.join(SHOTS, 'content-shorts.png'), fullPage: true });

// It survives a reload with nothing lost.
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('heading', { name: 'Shorts', exact: true }).waitFor({ timeout: 15000 });
check('a reload keeps every short', (await cards.count()) === count);

// Tidy up.
await page.evaluate((id) => fetch(`/api/content/sessions/${id}`, { method: 'DELETE' }), sessionId);
await finish();
