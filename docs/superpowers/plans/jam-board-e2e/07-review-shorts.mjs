// Review screen on a real processed session: live preview, edit list, approve, render, download.
//   SESSION=<id> BASE_URL=http://localhost:5180 node 07-review-shorts.mjs
import path from 'node:path';
import { SHOTS, start } from './harness.mjs';
const { page, check, open, finish } = await start();
const id = process.env.SESSION;
await open(`/content/${id}`);
await page.getByRole('heading', { name: 'Shorts', exact: true }).waitFor({ timeout: 30000 });
check('the editing settings show the AI director toggle', await page.getByRole('switch', { name: 'AI director' }).isVisible());
await page.getByRole('button', { name: 'Review edited short' }).first().click();
await page.getByText('Review short').waitFor();
await page.locator('.remotion-player, [class*="remotion"], canvas, video').first().waitFor({ timeout: 30000 }).catch(() => {});
await page.waitForTimeout(4000);
check('the edit list is shown', (await page.getByText(/Emphasis|Statement|Board visual|Number|Camera/).count()) > 0);
await page.screenshot({ path: path.join(SHOTS, 'review-drawer.png') });
const drawer = page.locator('aside');
await drawer.getByRole('button', { name: /^Approve/ }).click();
await drawer.getByRole('button', { name: 'Approved' }).waitFor({ timeout: 10000 });
check('approving works', true);
await drawer.getByRole('button', { name: /Render video|Render again/ }).click();
await drawer.getByText(/Rendering/).first().waitFor({ timeout: 15000 });
check('rendering starts with progress', true);
await drawer.getByRole('link', { name: /Download MP4/ }).waitFor({ timeout: 420000 });
check('the finished MP4 and subtitles can be downloaded', await drawer.getByRole('link', { name: '.srt' }).isVisible());
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(SHOTS, 'review-rendered.png') });
await finish();
