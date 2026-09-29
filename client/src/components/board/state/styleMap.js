import { TONE_COLORS } from '../engine/theme.js';

/**
 * Semantic style (what the property panel and DeepSeek speak: `color: 'problem'`,
 * `italic: true`) → Fabric properties (what the canvas needs: `fill`, `fontStyle`).
 * `kind` decides what "color" means: the fill of text, the stroke of a shape,
 * the ink of an arrow.
 */

export const resolveColor = (v) => TONE_COLORS[v] || v;

export function styleToFabric(style = {}, kind = 'text') {
  const out = {};
  const linear = kind === 'line' || kind === 'arrow';
  const texty = kind === 'text' || kind === 'sticky';

  for (const [key, value] of Object.entries(style)) {
    switch (key) {
      case 'fontFamily':
      case 'fontSize':
      case 'lineHeight':
      case 'opacity':
        out[key] = value;
        break;
      case 'fontWeight':
        out.fontWeight = value === 'bold' ? '700' : value === 'normal' ? '400' : String(value);
        break;
      case 'italic':
        out.fontStyle = value ? 'italic' : 'normal';
        break;
      case 'underline':
        out.underline = Boolean(value);
        break;
      case 'align':
        out.textAlign = value;
        break;
      case 'letterSpacing':
        out.charSpacing = value;
        break;
      case 'color': {
        const c = resolveColor(value);
        if (texty) out.fill = c;
        else if (linear) out.color = c;
        else out.stroke = c;
        break;
      }
      case 'fill':
        out.fill = resolveColor(value);
        break;
      case 'stroke':
        if (linear) out.color = resolveColor(value);
        else out.stroke = resolveColor(value);
        break;
      case 'strokeWidth':
        if (linear) out.lineWidth = value;
        else out.strokeWidth = value;
        break;
      case 'radius':
        out.rx = value;
        out.ry = value;
        break;
      case 'dash':
        if (linear) out.dashed = Boolean(value);
        else out.strokeDashArray = value ? [14, 9] : null;
        break;
      case 'headEnd':
      case 'headStart':
        if (linear) out[key] = Boolean(value);
        break;
      default:
        break;
    }
  }
  return out;
}
