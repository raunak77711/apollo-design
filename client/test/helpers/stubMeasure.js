/**
 * A deterministic stand-in for Fabric's text metrics: every glyph is a fixed
 * fraction of the font size wide, lines wrap on spaces, an unbreakable word
 * overflows (as it does in a real Textbox). Good enough to prove the layout's
 * geometry; the real thing is checked in the browser.
 */
export function stubMeasure(text, font, maxWidth) {
  const em = font.family === 'IBM Plex Mono' ? 0.6 : 0.58;
  const charW = font.size * em + ((font.letterSpacing || 0) / 1000) * font.size;
  const lines = [];
  for (const paragraph of String(text).split('\n')) {
    let line = '';
    for (const word of paragraph.split(' ')) {
      const trial = line ? `${line} ${word}` : word;
      if (line && trial.length * charW > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = trial;
      }
    }
    lines.push(line);
  }
  const widest = Math.max(...lines.map((l) => l.length * charW));
  return { w: widest, h: lines.length * font.size * font.lineHeight, lines: lines.length };
}
