import { useEffect, useState } from 'react';
import { continueRender, delayRender } from 'remotion';
import { FONT_PROBES, FONT_URL } from '../components/board/engine/theme.js';

/**
 * Text metrics for the video engine.
 *
 * The board's layout engine needs to know how big a piece of text is before it can place anything. In the
 * editor that comes from Fabric; here (inside Remotion, in a browser or a headless Chrome) it comes from a
 * canvas 2D context wrapping words the way a browser does, and a line box that matches Fabric's, so a block
 * measures the same here as on the board.
 */

export function createCanvasMeasure() {
  const ctx = document.createElement('canvas').getContext('2d');
  const cache = new Map();

  const widthOf = (text, font) => {
    ctx.font = `${font.italic ? 'italic ' : ''}${font.weight} ${font.size}px ${/\s/.test(font.family) ? `"${font.family}"` : font.family}`;
    return ctx.measureText(text).width + ((font.letterSpacing || 0) / 1000) * font.size * text.length;
  };

  return function measure(text, font, maxWidth) {
    const key = [font.family, font.size, font.weight, font.italic, font.letterSpacing, font.lineHeight, maxWidth, text].join('|');
    const hit = cache.get(key);
    if (hit) return hit;
    let lines = 0;
    let widest = 0;
    for (const paragraph of String(text).split('\n')) {
      let line = '';
      let any = false;
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (line && widthOf(next, font) > maxWidth) {
          widest = Math.max(widest, widthOf(line, font));
          lines += 1;
          line = word;
        } else {
          line = next;
        }
        any = true;
      }
      if (any || !paragraph) {
        widest = Math.max(widest, line ? widthOf(line, font) : 0);
        lines += 1;
      }
    }
    lines = Math.max(1, lines);
    // Fabric's line box: each line is 1.13 x the size; the last has no extra leading.
    const h = font.size * 1.13 * (1 + (lines - 1) * font.lineHeight);
    const result = { w: widest, h, lines };
    cache.set(key, result);
    return result;
  };
}

/**
 * Load the engine's typefaces before anything is measured or painted. Inside a render, `delayRender` holds
 * the frame until they are ready, so no frame is ever drawn in a fallback face.
 */
export function useEngineFonts() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const handle = delayRender('engine fonts');
    let cancelled = false;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FONT_URL;
    document.head.appendChild(link);
    const finish = () => {
      if (cancelled) return;
      setReady(true);
      continueRender(handle);
    };
    const timer = setTimeout(finish, 15000); // a missing network must not hang a render forever
    link.onload = () => {
      Promise.all(FONT_PROBES.map((p) => document.fonts.load(p).catch(() => null))).then(() => {
        clearTimeout(timer);
        finish();
      });
    };
    link.onerror = () => {
      clearTimeout(timer);
      finish();
    };
    return () => {
      cancelled = true;
    };
  }, []);
  return ready;
}
