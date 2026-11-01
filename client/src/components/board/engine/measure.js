/**
 * Text metrics from the real thing: a Fabric Textbox laid out with the same
 * font, size, spacing and wrap width the renderer will use. Layout runs in the
 * browser precisely so it can measure instead of estimate.
 *
 * Call `loadBoardFonts()` first — measuring before a face has loaded measures
 * the fallback face and the wrong wrap is then baked into the whole board.
 */

export function textboxOptions(font, width) {
  return {
    width,
    fontFamily: font.family,
    fontSize: font.size,
    fontWeight: String(font.weight),
    fontStyle: font.italic ? 'italic' : 'normal',
    charSpacing: font.letterSpacing || 0,
    lineHeight: font.lineHeight,
    textAlign: 'center',
    splitByGrapheme: false,
  };
}

export function createFabricMeasure(fabric) {
  const cache = new Map();
  return function measure(text, font, maxWidth) {
    const key = [font.family, font.size, font.weight, font.italic, font.letterSpacing, font.lineHeight, maxWidth, text].join('|');
    const hit = cache.get(key);
    if (hit) return hit;
    const box = new fabric.Textbox(text, textboxOptions(font, maxWidth));
    let widest = 0;
    for (let i = 0; i < box._textLines.length; i += 1) widest = Math.max(widest, box.getLineWidth(i));
    const result = { w: widest, h: box.height, lines: box._textLines.length };
    cache.set(key, result);
    return result;
  };
}
