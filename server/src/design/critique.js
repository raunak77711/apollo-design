/**
 * Automatic design critique — Apollo reviewing its own work before showing it.
 *
 * The composer builds designs that are correct by construction, but art
 * direction is not fully deterministic: a model can choose a palette whose
 * accent dies on its background, a headline long enough to crowd a lockup, or
 * a photograph whose bright half sits under white type. This pass measures
 * those things and repairs what it can, then reports what is left.
 *
 * It works on composed element specs, before ids are minted, so a repair is
 * just an edit to the design rather than a second round of operations.
 */

import { composite, contrastRatio, ensureContrast, hueCount, luminance, mix, parseHex, withAlpha } from './color.js';
import { fitText, leadingFor } from './typography.js';

const SEVERITY = { critical: 22, major: 12, minor: 5 };

const isText = (el) => el.type === 'text';
const isCopy = (el) => el.type === 'text' || el.type === 'button';
const area = (el) => Math.max(0, el.width) * Math.max(0, el.height);
const centerOf = (el) => ({ x: el.x + el.width / 2, y: el.y + el.height / 2 });

const overlaps = (a, b) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

/**
 * How much of `a` is covered by `b`, 0-1. Used to decide whether an element is
 * really the backdrop for another or merely brushes past it.
 */
function coverage(a, b) {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / Math.max(1, area(a));
}

/* ----------------------------- gradient maths ---------------------------- */

/** Position along a gradient axis (0-1) for a point inside an element. */
function gradientPosition(el, angle, point) {
  const radians = ((angle % 360) + 360) % 360 * (Math.PI / 180);
  // CSS convention: 0deg points to the top, angles increase clockwise.
  const dx = Math.sin(radians);
  const dy = -Math.cos(radians);
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const extent = (Math.abs(dx) * el.width + Math.abs(dy) * el.height) / 2;
  if (extent === 0) return 0.5;
  const projected = ((point.x - cx) * dx + (point.y - cy) * dy) / extent;
  return Math.min(1, Math.max(0, (projected + 1) / 2));
}

/** The colour a gradient shows at a given point, including its alpha. */
function sampleGradient(el, gradient, point) {
  const stops = [...(gradient.stops || [])].sort((a, b) => a.offset - b.offset);
  if (!stops.length) return { color: el.properties?.fill || '#000000', alpha: 1 };
  const t = (gradient.type === 'radial' ? radialPosition(el, point) : gradientPosition(el, gradient.angle ?? 180, point)) * 100;

  let lower = stops[0];
  let upper = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i += 1) {
    if (t >= stops[i].offset && t <= stops[i + 1].offset) {
      lower = stops[i];
      upper = stops[i + 1];
      break;
    }
  }
  const span = upper.offset - lower.offset || 1;
  const k = Math.min(1, Math.max(0, (t - lower.offset) / span));
  const a = parseHex(lower.color);
  const b = parseHex(upper.color);
  if (!a || !b) return { color: lower.color, alpha: 1 };
  return { color: mix(lower.color, upper.color, k), alpha: a.a + (b.a - a.a) * k };
}

function radialPosition(el, point) {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const rx = el.width / 2 || 1;
  const ry = el.height / 2 || 1;
  return Math.min(1, Math.hypot((point.x - cx) / rx, (point.y - cy) / ry));
}

/**
 * The colour actually behind a layer, composited bottom-up from the canvas.
 *
 * Photographs are treated as their mid-tone (a measured average when the
 * curator supplied one, a neutral otherwise) which is the honest worst case for
 * judging whether type will read.
 */
function backdropBehind(elements, index, box, canvasBackground) {
  const point = centerOf(box);
  let color = canvasBackground;

  for (let i = 0; i < index; i += 1) {
    const el = elements[i];
    if (isCopy(el) || el.type === 'icon' || el.type === 'line' || el.type === 'chart') continue;
    if (coverage(box, el) < 0.55) continue;
    const opacity = el.opacity ?? 1;
    if (opacity < 0.03) continue;

    if (el.type === 'image') {
      const tone = el.properties?.averageColor || '#7A7A7A';
      color = composite(tone, opacity, color);
      continue;
    }
    const props = el.properties || {};
    if (props.fill === 'transparent' || props.fillOpacity === 0) continue;
    if (props.gradient) {
      const sample = sampleGradient(el, props.gradient, point);
      color = composite(sample.color, sample.alpha * opacity, color);
    } else {
      color = composite(props.fill, opacity * (props.fillOpacity ?? 1), color);
    }
  }
  return color;
}

/* -------------------------------- checks -------------------------------- */

/**
 * Review and repair. Returns the (possibly edited) elements, a score out of
 * 100, and the issues found — resolved ones included, so the pipeline can say
 * what it fixed.
 */
export function critique(elements, { canvas, brief, grid }) {
  const issues = [];
  const list = elements.map((el) => ({ ...el, properties: { ...el.properties } }));
  const report = (severity, code, message, fixed = false) => issues.push({ severity, code, message, fixed });

  const safe = {
    left: grid.margin * 0.6,
    top: grid.margin * 0.6,
    right: canvas.width - grid.margin * 0.6,
    bottom: canvas.height - grid.margin * 0.6,
  };

  /*
   * 1. Nothing may hang outside the canvas, and copy must respect the margin.
   *
   * Vertical clamping is done in document order against a running floor: naive
   * clamping would pull every overflowing layer to the same bottom edge and
   * pile them on top of each other, turning one problem into five.
   */
  const copyLayers = list.filter(isCopy).sort((a, b) => a.y - b.y);
  for (const el of copyLayers) {
    let moved = false;
    if (el.x < safe.left - 1) {
      el.x = Math.round(safe.left);
      moved = true;
    }
    if (el.y < safe.top - 1) {
      el.y = Math.round(safe.top);
      moved = true;
    }
    if (el.x + el.width > safe.right + 1) {
      if (el.width > safe.right - safe.left) el.width = Math.round(safe.right - safe.left);
      el.x = Math.round(Math.max(safe.left, safe.right - el.width));
      moved = true;
    }
    if (moved) report('major', 'margins', `"${labelOf(el)}" broke the margin and was pulled back onto the grid`, true);
  }

  // Bottom overflow, resolved upwards only where there is genuinely room.
  for (let i = copyLayers.length - 1; i >= 0; i -= 1) {
    const el = copyLayers[i];
    if (el.y + el.height <= safe.bottom + 1) continue;
    const above = copyLayers
      .slice(0, i)
      .filter((other) => other.x < el.x + el.width && other.x + other.width > el.x);
    const ceiling = above.length ? Math.max(...above.map((o) => o.y + o.height)) + grid.baseline : safe.top;
    const target = Math.round(safe.bottom - el.height);
    if (target >= ceiling) {
      el.y = target;
      report('major', 'margins', `"${labelOf(el)}" overran the bottom margin and was lifted back inside`, true);
    } else {
      report('major', 'margins', `"${labelOf(el)}" does not fit the space it was given`);
    }
  }

  /* 2. Copy must clear its own frame — refit anything that would clip. */
  for (const el of list) {
    if (!isText(el)) continue;
    const p = el.properties;
    const lines = String(p.text || '').split('\n');
    const needed = lines.length * p.fontSize * (p.lineHeight || 1.2);
    if (needed > el.height + 1) {
      el.height = Math.ceil(needed * 1.02);
      report('minor', 'overflow', `"${labelOf(el)}" was clipping its frame and was re-fitted`, true);
    }
    const refit = fitText(p.text, {
      font: p.fontFamily,
      weight: p.fontWeight,
      maxWidth: el.width,
      maxSize: p.fontSize,
      minSize: 10,
      lineHeight: p.lineHeight || 1.2,
      letterSpacing: (p.letterSpacing || 0) / Math.max(1, p.fontSize),
      textCase: p.textCase,
      maxLines: lines.length + 1,
    });
    if (refit.size < p.fontSize) {
      p.fontSize = refit.size;
      p.text = refit.lines.join('\n');
      p.letterSpacing = refit.letterSpacing;
      el.height = Math.ceil(refit.lines.length * refit.size * (p.lineHeight || 1.2) * 1.02);
      report('minor', 'overflow', `"${labelOf(el)}" was too wide for its column and was re-set`, true);
    }
  }

  /* 3. Every piece of copy must clear WCAG against what is actually behind it. */
  for (let i = 0; i < list.length; i += 1) {
    const el = list[i];
    if (!isCopy(el)) continue;
    const p = el.properties;
    const backdrop = el.type === 'button' ? p.background : backdropBehind(list, i, el, canvas.background);
    const large = (p.fontSize || 16) >= 28 || ((p.fontSize || 16) >= 22 && (p.fontWeight || 400) >= 600);
    const minimum = large ? 3.1 : 4.5;
    const ratio = contrastRatio(p.color, backdrop);
    if (ratio >= minimum) continue;

    const repaired = ensureContrast(p.color, backdrop, minimum);
    if (contrastRatio(repaired, backdrop) >= minimum) {
      p.color = repaired;
      report('major', 'contrast', `"${labelOf(el)}" was hard to read (${ratio.toFixed(1)}:1) and its colour was corrected`, true);
      continue;
    }
    // The colour cannot be saved on its own — deepen the scrim beneath it.
    if (strengthenScrimUnder(list, i, el)) {
      report('major', 'contrast', `The scrim under "${labelOf(el)}" was deepened to protect legibility`, true);
    } else {
      report('critical', 'contrast', `"${labelOf(el)}" sits at ${ratio.toFixed(1)}:1 against its background`);
    }
  }

  /* 4. Two blocks of copy may not collide. */
  const copy = list.filter(isCopy);
  for (let i = 0; i < copy.length; i += 1) {
    for (let j = i + 1; j < copy.length; j += 1) {
      const a = copy[i];
      const b = copy[j];
      if (!overlaps(a, b)) continue;
      const lower = a.y <= b.y ? b : a;
      const upper = lower === a ? b : a;
      const push = upper.y + upper.height + Math.round(grid.baseline * 1.5) - lower.y;
      if (push > 0 && lower.y + lower.height + push <= safe.bottom) {
        lower.y = Math.round(lower.y + push);
        report('major', 'collision', `"${labelOf(lower)}" overlapped "${labelOf(upper)}" and was moved clear`, true);
      } else {
        report('major', 'collision', `"${labelOf(lower)}" overlaps "${labelOf(upper)}"`);
      }
    }
  }

  /* 5. There must be one obvious focal point. */
  const textSizes = list.filter(isText).map((el) => el.properties.fontSize || 0).sort((a, b) => b - a);
  const hasFullBleedImage = list.some((el) => el.type === 'image' && area(el) > canvas.width * canvas.height * 0.55);
  if (textSizes.length >= 2) {
    const dominance = textSizes[0] / (textSizes[1] || 1);
    if (dominance < 1.55 && !hasFullBleedImage) {
      const headline = list.filter(isText).sort((a, b) => (b.properties.fontSize || 0) - (a.properties.fontSize || 0))[0];
      const target = Math.round(textSizes[1] * 1.9);
      const refit = fitText(headline.properties.text.replace(/\n/g, ' '), {
        font: headline.properties.fontFamily,
        weight: headline.properties.fontWeight,
        maxWidth: headline.width,
        maxSize: target,
        minSize: textSizes[0],
        lineHeight: leadingFor(target, { display: true }),
        letterSpacing: (headline.properties.letterSpacing || 0) / Math.max(1, headline.properties.fontSize),
        textCase: headline.properties.textCase,
        maxLines: 3,
      });
      if (refit.size > headline.properties.fontSize) {
        const lead = leadingFor(refit.size, { display: true });
        headline.properties.fontSize = refit.size;
        headline.properties.text = refit.lines.join('\n');
        headline.properties.lineHeight = lead;
        headline.height = Math.ceil(refit.lines.length * refit.size * lead * 1.02);
        report('major', 'hierarchy', 'The headline did not dominate clearly enough and was scaled up', true);
      } else {
        report('minor', 'hierarchy', 'Type sizes sit close together — the hierarchy could be stronger');
      }
    }
  }

  /* 6. Density: neither bare nor packed. */
  const ink = list
    .filter((el) => !(el.type === 'rectangle' && area(el) > canvas.width * canvas.height * 0.9))
    .reduce((sum, el) => sum + area(el), 0);
  const density = ink / (canvas.width * canvas.height);
  if (density < 0.16 && !hasFullBleedImage) report('major', 'empty', 'The composition reads as empty — it needs more presence');
  if (density > 1.5) report('minor', 'crowded', 'The composition is dense — consider removing an element');

  /* 7. Colour discipline. */
  const palette = list
    .map((el) => el.properties?.fill || el.properties?.background || el.properties?.color)
    .filter((value) => typeof value === 'string' && value.startsWith('#'));
  const hues = hueCount([...palette, canvas.background]);
  if (hues > 4) report('minor', 'palette', `${hues} competing hues — a tighter palette would look more considered`);

  /* 8. Alignment: near-identical edges should be identical edges. */
  const edges = new Map();
  for (const el of list) {
    if (!isCopy(el)) continue;
    const key = [...edges.keys()].find((k) => Math.abs(k - el.x) <= 6);
    if (key == null) edges.set(el.x, [el]);
    else edges.get(key).push(el);
  }
  for (const [key, group] of edges) {
    if (group.length < 2) continue;
    for (const el of group) {
      if (el.x !== key) {
        el.x = key;
        report('minor', 'alignment', `"${labelOf(el)}" was ${Math.abs(el.x - key)}px off the shared axis and was snapped to it`, true);
      }
    }
  }

  /* 9. Visual interest: a design needs more than type on a flat field. */
  const devices = countDevices(list, canvas);
  if (devices < 2) report('major', 'flat', 'The design has little visual structure — it needs depth, colour or imagery');

  /* 10. Photography must actually be there. */
  const emptySlots = list.filter((el) => el.type === 'image' && !el.properties.src).length;
  if (emptySlots) report(emptySlots > 1 ? 'major' : 'minor', 'imagery', `${emptySlots} image slot${emptySlots > 1 ? 's' : ''} could not be filled`);

  const penalty = issues.filter((i) => !i.fixed).reduce((sum, i) => sum + SEVERITY[i.severity], 0);
  return {
    elements: list,
    score: Math.max(0, Math.min(100, 100 - penalty)),
    issues,
    fixed: issues.filter((i) => i.fixed),
    outstanding: issues.filter((i) => !i.fixed),
    density: Number(density.toFixed(3)),
  };
}

/** Deepen the nearest scrim beneath a layer so type on photography holds up. */
function strengthenScrimUnder(elements, index, el) {
  for (let i = index - 1; i >= 0; i -= 1) {
    const candidate = elements[i];
    if (candidate.type !== 'rectangle' || !candidate.properties?.gradient) continue;
    if (coverage(el, candidate) < 0.5) continue;
    const gradient = candidate.properties.gradient;
    gradient.stops = gradient.stops.map((stop) => {
      const rgb = parseHex(stop.color);
      if (!rgb || rgb.a === 0) return stop;
      return { ...stop, color: withAlpha(stop.color, Math.min(1, rgb.a + 0.18)) };
    });
    return true;
  }
  return false;
}

/** Counts the distinct visual devices in play — the opposite of "flat". */
function countDevices(elements, canvas) {
  let devices = 0;
  if (elements.some((el) => el.type === 'image' && el.properties.src)) devices += 1;
  if (elements.some((el) => el.properties?.gradient)) devices += 1;
  if (elements.some((el) => el.type === 'rectangle' && area(el) > canvas.width * canvas.height * 0.08 && area(el) < canvas.width * canvas.height * 0.85)) devices += 1;
  if (elements.some((el) => el.type === 'rectangle' && (el.height <= 8 || el.width <= 8))) devices += 1;
  if (elements.some((el) => el.shadow)) devices += 1;
  if (elements.some((el) => el.type === 'button')) devices += 1;
  const sizes = elements.filter(isText).map((el) => el.properties.fontSize);
  if (sizes.length >= 2 && Math.max(...sizes) / Math.min(...sizes) >= 3) devices += 1;
  return devices;
}

function labelOf(el) {
  if (el.name) return String(el.name).slice(0, 32);
  if (isCopy(el)) return String(el.properties?.text || el.type).split('\n')[0].slice(0, 32);
  return el.type;
}

/**
 * A short, human summary of the critique — this is what Apollo says in chat
 * after it has revised its own work.
 */
export function summarize(result) {
  if (!result.issues.length) return '';
  const fixed = result.fixed.length;
  const left = result.outstanding.length;
  const parts = [];
  if (fixed) parts.push(`refined ${fixed} thing${fixed === 1 ? '' : 's'} on review`);
  if (left) parts.push(`${left} to look at: ${result.outstanding.slice(0, 2).map((i) => i.message).join('; ')}`);
  return parts.join(' — ');
}

/** Does this design need a second attempt rather than a touch-up? */
export const needsRework = (result) =>
  result.score < 68 || result.outstanding.some((i) => i.severity === 'critical' || i.code === 'flat' || i.code === 'empty');
