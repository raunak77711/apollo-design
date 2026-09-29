// Shared plumbing for the Jam board acceptance scripts. See README.md.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

export const BASE = process.env.BASE_URL || 'http://127.0.0.1:5180';
export const SHOTS = path.join(os.tmpdir(), 'jam-board-shots');
fs.mkdirSync(SHOTS, { recursive: true });

/** Launch Chrome, collect console errors, and hand back small helpers. */
export async function start({ acceptDownloads = false } = {}) {
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, acceptDownloads });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('dialog', (d) => d.accept()); // confirm() prompts (clear, reset, replace) are accepted

  let failed = 0;
  const check = (name, ok, extra = '') => {
    if (!ok) failed += 1;
    console.log(ok ? 'PASS' : 'FAIL', name, extra);
  };
  const ed = (fn, arg) => page.evaluate(fn, arg);
  const open = (route) => page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
  const openBoard = async (route) => {
    await open(route);
    await page.waitForFunction(() => window.__boardEditor, null, { timeout: 30000 });
    await page.waitForTimeout(500);
  };
  /** Screen position of an object's centre, by id (piece or annotation). */
  const screenOf = (id) => ed((i) => {
    const e = window.__boardEditor;
    const c = (e.renderer.objectOf(i) || e.sync.objectOf(i)).getCenterPoint();
    const v = e.viewport.view;
    return { x: c.x * v.zoom + v.x, y: c.y * v.zoom + v.y };
  }, id);
  const finish = async () => {
    console.log('console errors:', JSON.stringify(errors));
    await browser.close();
    const bad = failed + errors.length;
    console.log(bad ? `${failed} FAILED, ${errors.length} console errors` : 'ALL PASSED');
    process.exit(bad ? 1 : 0);
  };
  return { page, check, ed, open, openBoard, screenOf, finish };
}
