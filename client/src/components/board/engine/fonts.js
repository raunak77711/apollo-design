import { FONT_PROBES, FONT_URL } from './theme.js';

let loading = null;

/**
 * Inject the board's typefaces and wait until each face the board uses is
 * actually loaded. Canvas text does not trigger a font fetch by itself, so
 * without the explicit probes Fabric measures and wraps the first render with
 * fallback metrics.
 *
 * Never rejects and never waits past `timeoutMs`: a font CDN that is down must
 * cost the board its typography, not the board.
 */
export function loadBoardFonts({ timeoutMs = 3000 } = {}) {
  if (loading) return loading;
  loading = new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    const finish = () => {
      clearTimeout(timer);
      resolve();
    };
    let link = document.querySelector('link[data-board-fonts]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = FONT_URL;
      link.dataset.boardFonts = '1';
      document.head.appendChild(link);
    }
    const sheetReady = new Promise((done) => {
      if (link.sheet) done();
      link.addEventListener('load', done, { once: true });
      link.addEventListener('error', done, { once: true });
    });
    sheetReady
      .then(() => Promise.all(FONT_PROBES.map((probe) => document.fonts.load(probe))))
      .catch(() => {})
      .then(finish);
  });
  return loading;
}
