/**
 * The composition engine.
 *
 * Apollo's division of labour: the model decides *what the design should feel
 * like*, this file decides *where every pixel goes*. Geometry is far too easy
 * for a language model to get subtly wrong — a 7px misalignment, a headline
 * that overflows, a margin that differs on each edge — and those small errors
 * are exactly what make generated work look cheap.
 *
 * So every layout here is built from one grid, one type scale and one spacing
 * rhythm. Variation comes from genuinely different structures, not from random
 * coordinates.
 */

import { MAX_DETAIL_LINES, accentRamp, photoTreatment } from './artDirection.js';
import { contrastRatio, darken, ensureContrast, isDark, lighten, mix, withAlpha } from './color.js';
import { fitText, headlineLines, leadingFor, measureLine, trackingFor, typeScale } from './typography.js';

/* --------------------------------- grid --------------------------------- */

/**
 * Margins scale with the canvas but never fall below a printable minimum, and
 * the baseline unit keeps vertical rhythm consistent between a card and a
 * poster. Everything else in this file positions against these numbers.
 */
export function gridFor({ width, height }, density = 'balanced') {
  const short = Math.min(width, height);
  const factor = density === 'airy' ? 0.098 : density === 'dense' ? 0.062 : 0.078;
  const margin = Math.round(Math.max(28, short * factor));
  const columns = 12;
  const gutter = Math.round(Math.max(12, short * 0.018));
  const inner = width - margin * 2;

  return {
    margin,
    gutter,
    columns,
    baseline: Math.max(6, Math.round(short * 0.011)),
    inner,
    column: (inner - gutter * (columns - 1)) / columns,
    left: margin,
    right: width - margin,
    top: margin,
    bottom: height - margin,
    /** x position of column `n` (0-indexed). */
    col(n) {
      return margin + n * (this.column + gutter);
    },
    /** width spanning `n` columns. */
    span(n) {
      return n * this.column + (n - 1) * gutter;
    },
  };
}

/** Deterministic per-prompt variation: same brief in, same design out. */
export function seededRandom(seed) {
  let state = 0;
  const text = String(seed);
  for (let i = 0; i < text.length; i += 1) state = (state * 31 + text.charCodeAt(i)) >>> 0;
  return function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* -------------------------------- scene --------------------------------- */

/** Collects elements in paint order and emits them as CREATE operations. */
function createScene() {
  const elements = [];
  return {
    elements,
    add(element) {
      const el = { ...element, zIndex: elements.length + 1 };
      elements.push(el);
      return el;
    },
    operations() {
      return elements.map((element) => ({ type: 'CREATE_ELEMENT', element }));
    },
  };
}

const round = (n) => Math.round(n);

/* ------------------------------ primitives ------------------------------ */

function block(scene, { x, y, width, height, fill, opacity, radius = 0, gradient, name, blendMode, shadow }) {
  return scene.add({
    type: 'rectangle',
    x: round(x),
    y: round(y),
    width: round(width),
    height: round(height),
    ...(opacity != null ? { opacity } : {}),
    ...(blendMode ? { blendMode } : {}),
    ...(shadow ? { shadow } : {}),
    name,
    properties: { fill: fill || '#000000', borderRadius: round(radius), ...(gradient ? { gradient } : {}) },
  });
}

function photo(scene, { x, y, width, height, image, treatment, radius = 0, name, shadow }) {
  return scene.add({
    type: 'image',
    x: round(x),
    y: round(y),
    width: round(width),
    height: round(height),
    ...(shadow ? { shadow } : {}),
    name: name || 'Photograph',
    properties: {
      src: image?.url || '',
      alt: image?.alt || image?.query || 'Photograph',
      fit: 'cover',
      borderRadius: round(radius),
      // The curator measured where the subject sits; the crop follows it.
      focalX: image?.focalX ?? 50,
      focalY: image?.focalY ?? 50,
      // Carried for the critic's contrast maths, then dropped by the schema.
      averageColor: image?.averageColor || '',
      ...treatment,
    },
  });
}

/**
 * How opaque a scrim has to be over this particular photograph. A dark, moody
 * frame needs barely any; a bright one needs a lot. Measuring it per image is
 * what keeps the photography visible instead of drowned under a flat slab.
 */
function scrimStrength(image, textColor) {
  if (!image?.averageColor) return 0.78;
  const ratio = contrastRatio(textColor, image.averageColor);
  if (ratio >= 8) return 0.5;
  if (ratio >= 5.5) return 0.64;
  if (ratio >= 3.5) return 0.78;
  return 0.9;
}

/**
 * A typeset text layer. The copy is pre-wrapped to the exact lines that were
 * measured, so what the browser renders is what the engine planned — no
 * surprise reflow, no clipped descender.
 */
function typeset(scene, { text, x, y, width, font, weight, size, color, align = 'left', textCase = 'none', letterSpacing = 0, lineHeight, maxLines = 4, maxHeight = Infinity, minSize = 11, name }) {
  const fitted = fitText(text, {
    font,
    weight,
    maxWidth: width,
    maxHeight,
    maxSize: size,
    minSize,
    lineHeight,
    letterSpacing,
    textCase,
    maxLines,
  });
  const height = Math.ceil(fitted.lines.length * fitted.size * lineHeight * 1.02);

  const el = scene.add({
    type: 'text',
    x: round(x),
    y: round(y),
    width: round(width),
    height,
    name: name || fitted.lines[0]?.slice(0, 28),
    properties: {
      text: fitted.lines.join('\n'),
      fontFamily: font,
      fontSize: fitted.size,
      fontWeight: weight,
      color,
      align,
      lineHeight,
      letterSpacing: fitted.letterSpacing,
      textCase,
    },
  });
  return { ...el, bottom: el.y + height, fitted };
}

/* ------------------------------ copy block ------------------------------ */

/**
 * Measures and then draws the eyebrow → headline → subhead → details → CTA
 * lockup. Measuring first is what allows a block to be centred or bottom-set
 * as a unit, which is how a composition ends up balanced instead of merely
 * top-aligned.
 */
function copyBlock(ctx, { width, align = 'left', maxHeadlineLines, sizes = {}, include = {}, onColor, scale = 1 }) {
  const { brief, type, style, palette, fonts, grid } = ctx;
  const copy = brief.copy;
  const show = { eyebrow: true, rule: true, headline: true, subhead: true, details: true, cta: true, ...include };
  const text = onColor?.text || palette.primary;
  const muted = onColor?.muted || palette.muted;
  const accent = onColor?.accent || palette.accent;
  const ground = onColor?.ground || palette.background;
  // An accent that works as a 4px rule is often too dark to read as 13px type.
  // The graphic keeps the true accent; the label gets a legible variant of it.
  // Targeted slightly above the 4.5:1 floor so a label over a scrimmed
  // photograph still clears it once the backdrop is composited for real.
  const accentText = onColor?.accentText || ensureContrast(accent, ground, 5);
  // One scale factor drives every size *and* every gap, so a lockup that has to
  // shrink stays in proportion rather than collapsing its rhythm.
  const s = (value) => Math.max(11, Math.round(value * scale));

  const parts = [];
  let height = 0;
  const gap = (n) => {
    height += n;
    parts.push({ kind: 'gap', size: n });
  };

  if (show.eyebrow && copy.eyebrow) {
    const size = s(sizes.eyebrow || type.eyebrow);
    const fitted = fitText(copy.eyebrow, {
      font: fonts.meta, weight: 600, maxWidth: width, maxSize: size, minSize: 9,
      lineHeight: 1.3, letterSpacing: style.type.eyebrowTracking, textCase: 'uppercase', maxLines: 1,
    });
    parts.push({ kind: 'eyebrow', fitted, height: Math.ceil(fitted.size * 1.35) });
    height += Math.ceil(fitted.size * 1.35);
    gap(Math.round(fitted.size * 0.9));
  }

  if (show.rule && style.geometry.rule >= 2 && copy.eyebrow) {
    const thickness = style.geometry.rule;
    parts.push({ kind: 'rule', height: thickness, width: Math.round(grid.column * 0.9) });
    height += thickness;
    gap(s(Math.round(type.headline * 0.22)));
  }

  if (show.headline && copy.headline) {
    const size = s(sizes.headline || type.headline);
    const tracking = trackingFor('headline', fonts, size);
    const fitted = fitText(copy.headline, {
      font: fonts.display,
      weight: style.type.headlineWeight,
      maxWidth: width,
      maxSize: size,
      minSize: Math.round(size * 0.34),
      lineHeight: leadingFor(size, { display: true }),
      letterSpacing: tracking,
      textCase: fonts.displayCase,
      maxLines: maxHeadlineLines || headlineLines(copy.headline, brief.layout),
    });
    const lead = leadingFor(fitted.size, { display: true });
    parts.push({ kind: 'headline', fitted, lead, height: Math.ceil(fitted.lines.length * fitted.size * lead * 1.02) });
    height += Math.ceil(fitted.lines.length * fitted.size * lead * 1.02);
  }

  if (show.subhead && copy.subhead) {
    const size = s(sizes.subhead || type.subhead);
    gap(Math.round(size * 1.15));
    const fitted = fitText(copy.subhead, {
      font: fonts.body, weight: 400, maxWidth: Math.min(width, ctx.measure * 0.62), maxSize: size,
      minSize: 12, lineHeight: leadingFor(size), letterSpacing: 0, maxLines: 3,
    });
    const lead = leadingFor(fitted.size);
    parts.push({ kind: 'subhead', fitted, lead, height: Math.ceil(fitted.lines.length * fitted.size * lead * 1.02) });
    height += Math.ceil(fitted.lines.length * fitted.size * lead * 1.02);
  }

  if (show.details && copy.details.length) {
    const size = s(sizes.detail || type.detail);
    gap(Math.round(size * 1.5));
    const rows = copy.details.slice(0, MAX_DETAIL_LINES).map((value) =>
      fitText(value, { font: fonts.meta, weight: 500, maxWidth: width, maxSize: size, minSize: 10, lineHeight: 1.4, letterSpacing: 0.04, maxLines: 1 })
    );
    const rowHeight = Math.ceil(size * 1.4);
    const stride = Math.round(rowHeight + size * 0.62);
    parts.push({ kind: 'details', rows, rowHeight, stride });
    height += stride * rows.length - (stride - rowHeight);
  }

  if (show.cta && copy.cta) {
    const size = s(sizes.cta || type.cta);
    gap(Math.round(size * 2));
    const asLink = ctx.ctaStyle === 'link';
    const label = style.type.ctaCase === 'uppercase' ? copy.cta.toUpperCase() : copy.cta;
    const tracking = size * (asLink ? 0.14 : 0.06);
    const labelWidth = measureLine(label, { font: fonts.body, size, letterSpacing: tracking, weight: 700 });
    const boxHeight = asLink ? Math.ceil(size * 1.9) : Math.ceil(size * 2.9);
    parts.push({ kind: 'cta', label, size, tracking, labelWidth, height: boxHeight, asLink });
    height += boxHeight;
  }

  return {
    height,
    /** Second pass: paint the measured block with its top-left at (x, y). */
    draw(scene, x, y) {
      let cursor = y;
      const place = (elementWidth) =>
        align === 'center' ? x + (width - elementWidth) / 2 : align === 'right' ? x + width - elementWidth : x;

      for (const part of parts) {
        if (part.kind === 'gap') {
          cursor += part.size;
          continue;
        }
        if (part.kind === 'rule') {
          block(scene, { x: place(part.width), y: cursor, width: part.width, height: part.height, fill: accent, name: 'Accent rule' });
          cursor += part.height;
          continue;
        }
        if (part.kind === 'eyebrow') {
          scene.add({
            type: 'text', x: round(x), y: round(cursor), width: round(width), height: part.height, name: 'Eyebrow',
            properties: {
              text: part.fitted.lines.join('\n'), fontFamily: fonts.meta, fontSize: part.fitted.size, fontWeight: 600,
              color: accentText, align, lineHeight: 1.3, letterSpacing: part.fitted.letterSpacing, textCase: 'uppercase',
            },
          });
          cursor += part.height;
          continue;
        }
        if (part.kind === 'headline') {
          scene.add({
            type: 'text', x: round(x), y: round(cursor), width: round(width), height: part.height, name: 'Headline',
            properties: {
              text: part.fitted.lines.join('\n'), fontFamily: fonts.display, fontSize: part.fitted.size,
              fontWeight: style.type.headlineWeight, color: text, align, lineHeight: part.lead,
              letterSpacing: part.fitted.letterSpacing, textCase: fonts.displayCase,
            },
          });
          cursor += part.height;
          continue;
        }
        if (part.kind === 'subhead') {
          scene.add({
            type: 'text', x: round(x), y: round(cursor), width: round(width), height: part.height, name: 'Supporting copy',
            properties: {
              text: part.fitted.lines.join('\n'), fontFamily: fonts.body, fontSize: part.fitted.size, fontWeight: 400,
              color: muted, align, lineHeight: part.lead, letterSpacing: 0, textCase: 'none',
            },
          });
          cursor += part.height;
          continue;
        }
        if (part.kind === 'details') {
          part.rows.forEach((row, i) => {
            const top = cursor + i * part.stride;
            scene.add({
              type: 'text', x: round(x), y: round(top), width: round(width), height: part.rowHeight, name: 'Detail',
              properties: {
                text: row.lines[0] || '', fontFamily: fonts.meta, fontSize: row.size, fontWeight: 500,
                color: muted, align, lineHeight: 1.4, letterSpacing: row.letterSpacing, textCase: 'none',
              },
            });
            if (i < part.rows.length - 1) {
              block(scene, {
                x: place(width), y: top + part.rowHeight + (part.stride - part.rowHeight) / 2 - 0.5,
                width, height: 1, fill: withAlpha(muted, 0.28), name: 'Divider',
              });
            }
          });
          cursor += part.stride * part.rows.length - (part.stride - part.rowHeight);
          continue;
        }
        if (part.kind === 'cta') {
          if (part.asLink) {
            const linkWidth = Math.ceil(part.labelWidth);
            const left = place(linkWidth);
            scene.add({
              type: 'text', x: round(left), y: round(cursor), width: linkWidth + 4, height: Math.ceil(part.size * 1.4), name: 'Call to action',
              properties: {
                text: part.label, fontFamily: fonts.body, fontSize: part.size, fontWeight: 600, color: text,
                align: 'left', lineHeight: 1.3, letterSpacing: part.tracking, textCase: style.type.ctaCase === 'uppercase' ? 'uppercase' : 'none',
              },
            });
            block(scene, { x: left, y: cursor + part.size * 1.62, width: linkWidth, height: Math.max(1, style.geometry.rule >= 3 ? 2 : 1), fill: accent, name: 'CTA rule' });
          } else {
            const padding = part.size * 2.1;
            const buttonWidth = Math.ceil(part.labelWidth + padding * 2);
            scene.add({
              type: 'button',
              x: round(place(buttonWidth)), y: round(cursor), width: buttonWidth, height: part.height, name: 'Call to action',
              properties: {
                text: part.label, fontFamily: fonts.body, fontSize: part.size, fontWeight: 700,
                color: palette.onAccent, background: accent,
                borderRadius: Math.min(part.height / 2, style.geometry.radius >= 20 ? part.height / 2 : style.geometry.radius),
                align: 'center', letterSpacing: part.tracking, textCase: style.type.ctaCase === 'uppercase' ? 'uppercase' : 'none',
              },
            });
          }
          cursor += part.height;
        }
      }
      return cursor;
    },
  };
}

/**
 * Fit a lockup into the room it actually has.
 *
 * A designer handed too much copy for the space does two things, in order:
 * sets it smaller, then cuts it. This does the same — scale first, and only
 * when scaling alone would make the type weak does it drop the detail lines
 * and then the supporting sentence. The result is a block that always sits
 * inside its region, so nothing downstream has to rescue it.
 */
const FIT_STEPS = [
  { scale: 1, drop: {} },
  { scale: 0.92, drop: {} },
  { scale: 0.85, drop: {} },
  { scale: 0.85, drop: { details: false } },
  { scale: 0.78, drop: { details: false } },
  { scale: 0.72, drop: { details: false } },
  { scale: 0.72, drop: { details: false, subhead: false } },
  { scale: 0.66, drop: { details: false, subhead: false } },
];

function fitCopyBlock(ctx, options, available) {
  let best = null;
  for (const step of FIT_STEPS) {
    const candidate = copyBlock(ctx, {
      ...options,
      scale: step.scale,
      include: { ...(options.include || {}), ...step.drop },
    });
    best = candidate;
    if (!Number.isFinite(available) || candidate.height <= available) return candidate;
  }
  // Nothing fits: return the smallest version rather than shrinking type into
  // illegibility. The critic reports it, so the failure is visible, not hidden.
  return best;
}

/* ------------------------------- gradients ------------------------------ */

/**
 * A scrim is a gradient, never a flat 70%-black slab: the photograph keeps its
 * light where there is no type, and the type still gets the contrast it needs.
 */
function scrim(color, { from = 'bottom', strength = 0.92, reach = 62, soft = 0.55 } = {}) {
  const angles = { bottom: 0, top: 180, left: 90, right: 270 };
  return {
    type: 'linear',
    angle: angles[from] ?? 0,
    stops: [
      { color: withAlpha(color, strength), offset: 0 },
      { color: withAlpha(color, strength * soft), offset: Math.round(reach * 0.42) },
      { color: withAlpha(color, 0), offset: reach },
    ],
  };
}

/** A soft directional wash used to give flat colour fields some depth. */
function sheen(color, accent, { angle = 135, amount = 0.55 } = {}) {
  return {
    type: 'linear',
    angle,
    stops: [
      { color: withAlpha(mix(color, accent, 0.18), 1), offset: 0 },
      { color: withAlpha(color, 1), offset: Math.round(amount * 100) },
      { color: withAlpha(isDark(color) ? darken(color, 0.35) : lighten(color, 0.25), 1), offset: 100 },
    ],
  };
}

/* ------------------------------- archetypes ------------------------------ */

/**
 * Each archetype receives the same context and returns nothing — it paints into
 * the scene. They are written to be readable as compositions: read top to
 * bottom and you can see the design being built up in layers.
 */
const ARCHETYPES = {
  /* One photograph, the whole frame, type sitting in its shadow. */
  'full-bleed-hero'(ctx) {
    const { scene, canvas, grid, palette, brief, rand } = ctx;
    const hero = ctx.images[0];
    const anchor = hero?.negativeSpace === 'top' ? 'top' : 'bottom';
    const tall = canvas.height / canvas.width > 1.2;

    photo(scene, { x: 0, y: 0, width: canvas.width, height: canvas.height, image: hero, treatment: ctx.treatment, name: 'Hero photograph' });

    // Directional scrim: strongest where the type lands, clear where it does
    // not, and only as deep as this particular photograph requires.
    block(scene, {
      x: 0, y: 0, width: canvas.width, height: canvas.height,
      fill: palette.background,
      gradient: scrim(palette.background, {
        from: anchor,
        strength: scrimStrength(hero, palette.primary),
        reach: tall ? 68 : 78,
        soft: 0.5,
      }),
      name: 'Legibility scrim',
    });
    // A second, very light wash across the whole frame unifies the photograph
    // with the palette instead of leaving it looking pasted in.
    block(scene, {
      x: 0, y: 0, width: canvas.width, height: canvas.height,
      fill: palette.background, opacity: 0.16, blendMode: 'multiply', name: 'Colour unify',
    });

    const width = Math.min(grid.span(tall ? 12 : 8), grid.inner);
    // Type may take the lower two thirds; above that belongs to the picture.
    const lockup = fitCopyBlock(ctx, { width, align: 'left' }, Math.round(canvas.height * 0.68) - grid.margin);
    const y = anchor === 'bottom' ? grid.bottom - lockup.height : grid.top + Math.round(canvas.height * 0.06);
    lockup.draw(scene, grid.left, y);

    // Brand mark opposite the lockup, so the frame is held at both ends.
    if (brief.copy.meta) {
      const size = ctx.type.meta;
      const metaY = anchor === 'bottom' ? grid.top : grid.bottom - size * 1.6;
      typeset(scene, {
        text: brief.copy.meta, x: grid.left, y: metaY, width: grid.inner, font: ctx.fonts.meta, weight: 500,
        size, color: withAlpha(palette.primary, 0.82), align: rand() > 0.5 ? 'right' : 'left',
        textCase: 'uppercase', letterSpacing: 0.3, lineHeight: 1.4, maxLines: 1, name: 'Brand line',
      });
    }
  },

  /* Two fields: photography and colour, meeting on a hard edge. */
  'split-vertical'(ctx) {
    const { scene, canvas, grid, palette, style, rand } = ctx;
    const hero = ctx.images[0];
    const horizontal = canvas.width / canvas.height >= 0.95;
    // The photograph goes on the side its own composition supports.
    const imageFirst = hero?.negativeSpace === 'right' ? false : hero?.negativeSpace === 'left' ? true : rand() > 0.5;
    const ratio = horizontal ? 0.48 + rand() * 0.06 : 0.52;

    if (horizontal) {
      const imageWidth = Math.round(canvas.width * ratio);
      const imageX = imageFirst ? 0 : canvas.width - imageWidth;
      const fieldX = imageFirst ? imageWidth : 0;
      const fieldWidth = canvas.width - imageWidth;

      block(scene, { x: fieldX, y: 0, width: fieldWidth, height: canvas.height, fill: palette.surface, gradient: sheen(palette.surface, palette.accent), name: 'Colour field' });
      photo(scene, { x: imageX, y: 0, width: imageWidth, height: canvas.height, image: hero, treatment: ctx.treatment, name: 'Photograph' });

      const pad = Math.round(grid.margin * 1.05);
      const width = fieldWidth - pad * 2;
      const lockup = fitCopyBlock(ctx, { width, align: 'left', onColor: ctx.onSurface }, canvas.height - pad * 2);
      lockup.draw(scene, fieldX + pad, Math.round((canvas.height - lockup.height) / 2));

      // A slim accent rib on the seam turns two blocks into one composition.
      block(scene, {
        x: imageFirst ? imageWidth - style.geometry.rule : imageWidth, y: 0,
        width: Math.max(2, style.geometry.rule), height: canvas.height, fill: palette.accent, name: 'Seam',
      });
    } else {
      const imageHeight = Math.round(canvas.height * 0.54);
      photo(scene, { x: 0, y: 0, width: canvas.width, height: imageHeight, image: hero, treatment: ctx.treatment, name: 'Photograph' });
      block(scene, { x: 0, y: imageHeight, width: canvas.width, height: canvas.height - imageHeight, fill: palette.surface, gradient: sheen(palette.surface, palette.accent, { angle: 160 }), name: 'Colour field' });

      const width = grid.inner;
      const room = canvas.height - imageHeight;
      const lockup = fitCopyBlock(ctx, { width, align: 'left', onColor: ctx.onSurface }, room - grid.margin);
      lockup.draw(scene, grid.left, imageHeight + Math.round((room - lockup.height) / 2));
      block(scene, { x: 0, y: imageHeight - Math.max(2, style.geometry.rule), width: canvas.width, height: Math.max(2, style.geometry.rule), fill: palette.accent, name: 'Seam' });
    }
  },

  /* Magazine structure: an offset plate, a strong left axis, hairline rules. */
  'editorial-asymmetric'(ctx) {
    const { scene, canvas, grid, palette, style, brief, type } = ctx;
    const hero = ctx.images[0];
    const wide = canvas.width / canvas.height >= 1.2;

    block(scene, { x: 0, y: 0, width: canvas.width, height: canvas.height, fill: palette.background, name: 'Ground' });

    const plate = wide
      ? { x: Math.round(canvas.width * 0.52), y: grid.top, width: Math.round(canvas.width * 0.48) - grid.margin, height: canvas.height - grid.margin * 2 }
      : { x: Math.round(canvas.width * 0.34), y: grid.top, width: canvas.width - Math.round(canvas.width * 0.34) - grid.margin, height: Math.round(canvas.height * 0.46) };

    photo(scene, { ...plate, image: hero, treatment: ctx.treatment, radius: style.geometry.radius, name: 'Editorial plate' });

    // Index line — the small structural detail that reads as art direction.
    const indexY = grid.top;
    typeset(scene, {
      text: brief.copy.meta || brief.designType.toUpperCase(), x: grid.left, y: indexY, width: grid.span(4),
      font: ctx.fonts.meta, weight: 500, size: type.meta, color: palette.muted, letterSpacing: 0.28,
      lineHeight: 1.4, textCase: 'uppercase', maxLines: 1, name: 'Index',
    });
    block(scene, { x: grid.left, y: indexY + type.meta * 2, width: wide ? grid.span(5) : grid.inner, height: 1, fill: withAlpha(palette.muted, 0.4), name: 'Hairline' });

    const width = wide ? grid.span(6) : grid.inner;
    const ceiling = wide ? indexY + type.meta * 3.4 : plate.y + plate.height + Math.round(grid.margin * 0.9);
    const lockup = fitCopyBlock(ctx, { width, align: 'left' }, grid.bottom - ceiling - grid.baseline * 2);
    const top = wide ? Math.max(ceiling, Math.round((canvas.height - lockup.height) / 2)) : ceiling;
    lockup.draw(scene, grid.left, top);

    // Closing rule anchors the page and keeps the bottom margin honest.
    block(scene, { x: grid.left, y: grid.bottom - 1, width: wide ? grid.span(4) : grid.span(6), height: 1, fill: withAlpha(palette.muted, 0.4), name: 'Hairline' });
  },

  /* Typography as the image: scale contrast doing all the work. */
  'type-poster'(ctx) {
    const { scene, canvas, grid, palette, brief, type } = ctx;
    const ramp = accentRamp(palette);

    block(scene, { x: 0, y: 0, width: canvas.width, height: canvas.height, fill: palette.background, gradient: sheen(palette.background, palette.accent, { angle: 155, amount: 0.62 }), name: 'Ground' });

    // Supporting copy and CTA sit in a firm footer row rather than trailing the
    // headline — the poster keeps its top-heavy weight.
    const footer = fitCopyBlock(
      ctx,
      { width: grid.span(7), align: 'left', include: { eyebrow: false, rule: false, headline: false } },
      Math.round(canvas.height * 0.3)
    );

    // The colour block is the headline's own field, sized to the type it holds
    // and knocked out of it — colour blocking, not a stripe laid on top.
    const onBlock = {
      text: palette.onAccent,
      muted: withAlpha(palette.onAccent, 0.82),
      accent: palette.onAccent,
      accentText: palette.onAccent,
      ground: palette.accent,
    };
    const headlineTop = Math.round(canvas.height * 0.2);
    const headline = fitCopyBlock(
      { ...ctx, palette: { ...palette, onAccent: palette.accent } },
      {
        width: grid.inner,
        align: 'left',
        include: { subhead: false, details: false, cta: false },
        maxHeadlineLines: 3,
        sizes: { headline: type.headline },
        onColor: onBlock,
      },
      grid.bottom - footer.height - headlineTop - grid.margin
    );

    const pad = Math.round(grid.margin * 0.7);
    block(scene, {
      x: 0, y: headlineTop - pad, width: canvas.width, height: headline.height + pad * 2,
      fill: ramp.base, name: 'Colour block',
    });
    headline.draw(scene, grid.left, headlineTop);
    footer.draw(scene, grid.left, grid.bottom - footer.height);

    // The brand line shares the footer row, set hard right in its own column so
    // it reads as part of the same band rather than a floating label.
    if (brief.copy.meta) {
      const columnX = grid.left + grid.span(8) + grid.gutter;
      typeset(scene, {
        text: brief.copy.meta, x: columnX, y: grid.bottom - type.meta * 1.5, width: grid.right - columnX,
        font: ctx.fonts.meta, weight: 500, size: type.meta, color: palette.muted, align: 'right',
        letterSpacing: 0.3, lineHeight: 1.4, textCase: 'uppercase', maxLines: 1, name: 'Brand line',
      });
    }
  },

  /* Space as the luxury: a small plate, centred type, nothing else. */
  'minimal-frame'(ctx) {
    const { scene, canvas, grid, palette, brief, type } = ctx;
    const hero = ctx.images[0];
    const inset = Math.round(grid.margin * 0.62);

    block(scene, { x: 0, y: 0, width: canvas.width, height: canvas.height, fill: palette.background, name: 'Ground' });
    scene.add({
      type: 'rectangle', x: inset, y: inset, width: canvas.width - inset * 2, height: canvas.height - inset * 2, zIndex: 2,
      name: 'Frame',
      properties: { fill: 'transparent', fillOpacity: 0, borderColor: withAlpha(palette.muted, 0.45), borderWidth: 1, borderRadius: 0 },
    });

    // The plate is sized from whatever the canvas can spare, so this layout
    // holds together on a tall poster and a wide card alike.
    const plateTop = Math.round(canvas.height * 0.12);
    const plateHeight = Math.round(Math.min(canvas.width * 0.52, canvas.height * 0.4));
    const plateWidth = Math.round(Math.min(canvas.width * 0.42, plateHeight / 1.24));
    if (hero?.url) {
      photo(scene, {
        x: (canvas.width - plateWidth) / 2, y: plateTop, width: plateWidth, height: plateHeight,
        image: hero, treatment: ctx.treatment, radius: ctx.style.geometry.radius >= 100 ? plateWidth / 2 : ctx.style.geometry.radius, name: 'Plate',
      });
    }

    const width = Math.round(grid.inner * 0.76);
    const plateBottom = hero?.url ? plateTop + plateHeight : Math.round(canvas.height * 0.3);
    // The brand line keeps the foot of the page to itself.
    const footerReserve = brief.copy.meta ? Math.round(type.meta * 3.2) : 0;
    const room = canvas.height - grid.margin - footerReserve - plateBottom;
    const lockup = fitCopyBlock({ ...ctx, ctaStyle: 'link' }, { width, align: 'center' }, room - Math.round(grid.margin * 0.6));
    lockup.draw(scene, (canvas.width - width) / 2, plateBottom + Math.max(Math.round(grid.margin * 0.7), Math.round((room - lockup.height) / 2)));

    if (brief.copy.meta) {
      typeset(scene, {
        text: brief.copy.meta, x: grid.left, y: grid.bottom - type.meta * 1.6, width: grid.inner, font: ctx.fonts.meta,
        weight: 500, size: type.meta, color: withAlpha(palette.muted, 0.9), align: 'center', letterSpacing: 0.34,
        lineHeight: 1.4, textCase: 'uppercase', maxLines: 1, name: 'Brand line',
      });
    }
  },

  /* Depth through overlap: a plate, an offset block, type crossing both. */
  'overlap-collage'(ctx) {
    const { scene, canvas, grid, palette, style, rand } = ctx;
    const hero = ctx.images[0];
    const ramp = accentRamp(palette);
    const offset = Math.round(Math.min(canvas.width, canvas.height) * 0.045);
    const left = rand() > 0.5;

    block(scene, { x: 0, y: 0, width: canvas.width, height: canvas.height, fill: palette.background, gradient: sheen(palette.background, palette.accent, { angle: 145, amount: 0.7 }), name: 'Ground' });

    const plate = {
      width: Math.round(canvas.width * 0.56),
      height: Math.round(canvas.height * 0.46),
    };
    plate.x = left ? grid.left : canvas.width - grid.margin - plate.width;
    plate.y = Math.round(canvas.height * 0.1);

    // The block behind the plate is what creates the sense of depth; it is
    // offset on the diagonal, never centred behind it.
    block(scene, {
      x: plate.x + (left ? -offset : offset), y: plate.y + offset, width: plate.width, height: plate.height,
      fill: ramp.base, radius: style.geometry.radius, name: 'Depth block',
    });
    photo(scene, {
      ...plate, image: hero, treatment: ctx.treatment, radius: style.geometry.radius, name: 'Photograph',
      shadow: { x: 0, y: Math.round(offset * 0.7), blur: Math.round(offset * 2.4), color: withAlpha('#000000', 0.34) },
    });

    const width = grid.span(9);
    // Type starts over the plate and continues past it — the overlap is the point.
    const top = plate.y + plate.height - Math.round(ctx.type.headline * 0.55);
    const lockup = fitCopyBlock(ctx, { width, align: 'left' }, grid.bottom - top);
    lockup.draw(scene, grid.left, Math.min(top, grid.bottom - lockup.height));
  },

  /* Firm horizontal rhythm: colour, photograph, colour. */
  'band-stack'(ctx) {
    const { scene, canvas, grid, palette, style, type, brief } = ctx;
    const hero = ctx.images[0];
    const topBand = Math.round(canvas.height * 0.2);
    const imageBand = Math.round(canvas.height * 0.42);

    block(scene, { x: 0, y: 0, width: canvas.width, height: canvas.height, fill: palette.background, name: 'Ground' });
    block(scene, { x: 0, y: 0, width: canvas.width, height: topBand, fill: palette.accent, name: 'Accent band' });
    photo(scene, { x: 0, y: topBand, width: canvas.width, height: imageBand, image: hero, treatment: ctx.treatment, name: 'Photograph' });
    block(scene, {
      x: 0, y: topBand, width: canvas.width, height: imageBand, fill: palette.background,
      gradient: scrim(palette.background, { from: 'bottom', strength: scrimStrength(hero, palette.primary), reach: 58, soft: 0.42 }),
      name: 'Band scrim',
    });

    typeset(scene, {
      text: brief.copy.eyebrow || brief.copy.meta || '', x: grid.left, y: Math.round(topBand / 2 - type.eyebrow * 0.7),
      width: grid.inner, font: ctx.fonts.meta, weight: 700, size: type.eyebrow * 1.15,
      color: palette.onAccent, letterSpacing: style.type.eyebrowTracking, lineHeight: 1.3, textCase: 'uppercase',
      maxLines: 1, name: 'Eyebrow',
    });

    const bandBottom = topBand + imageBand;
    const top = bandBottom - Math.round(type.headline * 0.45);
    const lockup = fitCopyBlock(ctx, { width: grid.inner, align: 'left', include: { eyebrow: false, rule: false } }, grid.bottom - top);
    lockup.draw(scene, grid.left, Math.min(top, grid.bottom - lockup.height));
  },

  /* Diagonal energy: a masked corner plate against an open type field. */
  'corner-hero'(ctx) {
    const { scene, canvas, grid, palette, style, rand } = ctx;
    const hero = ctx.images[0];
    const ramp = accentRamp(palette);
    const size = Math.round(Math.min(canvas.width, canvas.height) * 0.72);
    const topCorner = rand() > 0.5;

    block(scene, { x: 0, y: 0, width: canvas.width, height: canvas.height, fill: palette.background, gradient: sheen(palette.background, palette.accent, { angle: topCorner ? 200 : 20, amount: 0.66 }), name: 'Ground' });

    const plate = {
      x: canvas.width - Math.round(size * 0.68),
      y: topCorner ? -Math.round(size * 0.18) : canvas.height - Math.round(size * 0.82),
      width: size,
      height: size,
    };
    block(scene, { x: plate.x - Math.round(size * 0.06), y: plate.y + Math.round(size * 0.05), width: size, height: size, fill: ramp.base, radius: size / 2, opacity: 0.9, name: 'Accent disc' });
    photo(scene, { ...plate, image: hero, treatment: ctx.treatment, radius: size / 2, name: 'Photograph' });

    const width = grid.span(7);
    const lockup = fitCopyBlock(ctx, { width, align: 'left' }, Math.round(canvas.height * 0.48));
    const y = topCorner ? grid.bottom - lockup.height : grid.top + Math.round(canvas.height * 0.04);
    lockup.draw(scene, grid.left, y);
    block(scene, {
      x: grid.left, y: (topCorner ? grid.bottom - lockup.height : grid.top + Math.round(canvas.height * 0.04)) - Math.round(style.geometry.rule * 4),
      width: Math.round(grid.column * 1.4), height: style.geometry.rule + 1, fill: ramp.base, name: 'Accent rule',
    });
  },

  /* Modular grid: several frames, one of them type. */
  'grid-editorial'(ctx) {
    const { scene, canvas, grid, palette, style, type, brief } = ctx;
    const wide = canvas.width / canvas.height >= 1.2;
    const cols = wide ? 3 : 2;
    const rows = wide ? 2 : 3;
    const gap = grid.gutter;
    const cellWidth = (grid.inner - gap * (cols - 1)) / cols;
    const available = canvas.height - grid.margin * 2;
    const cellHeight = (available - gap * (rows - 1)) / rows;

    block(scene, { x: 0, y: 0, width: canvas.width, height: canvas.height, fill: palette.background, name: 'Ground' });

    // The type cell spans the full first row so the message leads the grid.
    const typeCellHeight = cellHeight;
    const lockup = fitCopyBlock(
      ctx,
      {
        width: wide ? cellWidth * 2 + gap : grid.inner,
        align: 'left',
        include: { details: false },
        sizes: { headline: Math.round(type.headline * 0.72) },
      },
      typeCellHeight
    );
    lockup.draw(scene, grid.left, grid.top + Math.max(0, (typeCellHeight - lockup.height) / 2));

    const cells = [];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const first = r === 0 && c < (wide ? 2 : cols);
        if (first) continue;
        cells.push({
          x: grid.left + c * (cellWidth + gap),
          y: grid.top + r * (cellHeight + gap),
          width: cellWidth,
          height: cellHeight,
        });
      }
    }
    cells.forEach((cell, i) => {
      const image = ctx.images[i % Math.max(1, ctx.images.length)];
      if (image?.url) {
        photo(scene, { ...cell, image, treatment: ctx.treatment, radius: style.geometry.radius, name: `Frame ${i + 1}` });
      } else {
        block(scene, { ...cell, fill: i % 2 ? palette.surface : palette.accent, radius: style.geometry.radius, name: `Frame ${i + 1}` });
      }
    });

    if (brief.copy.details.length) {
      const last = cells[cells.length - 1];
      if (last) {
        block(scene, { ...last, fill: palette.surface, radius: style.geometry.radius, name: 'Detail card' });
        const detail = fitCopyBlock(
          ctx,
          {
            width: last.width - grid.gutter * 2,
            align: 'left',
            include: { eyebrow: false, rule: false, headline: false, subhead: false, cta: false },
            onColor: ctx.onSurface,
          },
          last.height - grid.gutter * 2
        );
        detail.draw(scene, last.x + grid.gutter, last.y + Math.max(grid.gutter, (last.height - detail.height) / 2));
      }
    }
  },

  /* Wide format lockup: type left, photograph right, one firm baseline. */
  'banner-lockup'(ctx) {
    const { scene, canvas, grid, palette, style } = ctx;
    const hero = ctx.images[0];
    const imageWidth = Math.round(canvas.width * 0.42);
    const imageX = canvas.width - imageWidth;

    block(scene, { x: 0, y: 0, width: canvas.width, height: canvas.height, fill: palette.background, gradient: sheen(palette.background, palette.accent, { angle: 120, amount: 0.72 }), name: 'Ground' });
    photo(scene, { x: imageX, y: 0, width: imageWidth, height: canvas.height, image: hero, treatment: ctx.treatment, name: 'Photograph' });
    // The photograph fades into the field rather than butting against it.
    block(scene, {
      x: imageX - Math.round(canvas.width * 0.08), y: 0, width: Math.round(canvas.width * 0.16), height: canvas.height,
      fill: palette.background, gradient: scrim(palette.background, { from: 'left', strength: 1, reach: 100, soft: 0.6 }), name: 'Blend',
    });

    const width = imageX - grid.left - Math.round(grid.margin * 1.2);
    const lockup = fitCopyBlock(ctx, { width, align: 'left' }, canvas.height - grid.margin * 2);
    lockup.draw(scene, grid.left, Math.round((canvas.height - lockup.height) / 2));
    block(scene, { x: 0, y: 0, width: Math.max(3, style.geometry.rule + 2), height: canvas.height, fill: palette.accent, name: 'Edge rule' });
  },

  /**
   * Data, not a photograph: a headline, then either a real chart (when the
   * brief proposed one) or the detail rows laid out as a grid of fact cards
   * instead of one stacked list. This is the times-table / quick-comparison /
   * step-by-step shape — nothing here is photographic.
   */
  'stat-grid'(ctx) {
    const { scene, canvas, grid, palette, style, type, fonts, brief } = ctx;
    block(scene, { x: 0, y: 0, width: canvas.width, height: canvas.height, fill: palette.background, name: 'Ground' });

    const headroom = Math.round(canvas.height * 0.34);
    const lockup = fitCopyBlock(ctx, { width: grid.inner, align: 'left', include: { details: false, cta: false } }, headroom);
    lockup.draw(scene, grid.left, grid.top);

    const bodyTop = grid.top + lockup.height + grid.gutter * 2;
    const bodyHeight = Math.max(80, grid.bottom - bodyTop);

    if (brief.chart) {
      scene.add({
        type: 'chart',
        x: grid.left, y: bodyTop, width: grid.inner, height: bodyHeight,
        name: 'Chart',
        properties: {
          chartType: brief.chart.chartType,
          data: brief.chart.data,
          color: palette.accent,
          labelColor: palette.primary,
          showValues: true,
        },
      });
      return;
    }

    const items = brief.copy.details;
    if (!items.length) return;
    const cols = items.length > 6 ? 3 : items.length > 1 ? 2 : 1;
    const rows = Math.ceil(items.length / cols);
    const gap = grid.gutter;
    const cellWidth = (grid.inner - gap * (cols - 1)) / cols;
    const cellHeight = Math.min((bodyHeight - gap * (rows - 1)) / rows, cellWidth * 0.68);
    const pad = Math.round(cellWidth * 0.08);

    items.forEach((text, i) => {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const x = grid.left + c * (cellWidth + gap);
      const y = bodyTop + r * (cellHeight + gap);
      block(scene, { x, y, width: cellWidth, height: cellHeight, fill: palette.surface, radius: style.geometry.radius, name: `Fact ${i + 1}` });
      typeset(scene, {
        text, x: x + pad, y: y + pad, width: cellWidth - pad * 2, maxHeight: cellHeight - pad * 2,
        font: fonts.body, weight: 600, size: Math.min(type.subhead, cellHeight * 0.3), minSize: 12,
        color: ctx.onSurface.text, align: 'left', lineHeight: 1.25, maxLines: 3, name: `Fact ${i + 1}`,
      });
    });
  },
};

// A labeled diagram is a split-vertical composition: illustration on one
// side, its copy block (headline + the numbered legend in "details") on the
// other. No new geometry is needed — only the art direction differs, which
// is guided in the DeepSeek prompt, not here.
ARCHETYPES['labeled-diagram'] = ARCHETYPES['split-vertical'];

export const LAYOUT_IDS = Object.keys(ARCHETYPES);

/* -------------------------------- compose -------------------------------- */

/**
 * Turn a normalised brief plus sourced photography into Apollo operations.
 *
 * The returned operations are ordinary CREATE_ELEMENT calls — everything the
 * engine produces stays fully editable by hand, which is the whole point of
 * composing into the document model rather than rendering an image.
 */
export function compose(brief, images = [], { seed = brief.copy?.headline || 'apollo' } = {}) {
  const style = brief.styleRef;
  const canvas = brief.canvas;
  const grid = gridFor(canvas, style.geometry.density);
  const rand = seededRandom(`${seed}:${brief.layout}`);
  const energy = style.id === 'bold-poster' || style.id === 'street-urban' ? 1.1 : style.id === 'luxury-editorial' || style.id === 'soft-elegant' ? 0.88 : 1;
  const type = typeScale(canvas, { energy, layout: brief.layout });
  const palette = brief.palette;

  const scene = createScene();
  const ctx = {
    scene,
    brief,
    canvas,
    grid,
    palette,
    style,
    fonts: brief.fonts,
    type,
    rand,
    measure: canvas.width,
    images: images.length ? images : brief.images.map((plan) => ({ ...plan, url: '' })),
    treatment: photoTreatment(style, { onDark: palette.dark }),
    ctaStyle: style.id === 'luxury-editorial' || style.id === 'soft-elegant' || brief.layout === 'minimal-frame' ? 'link' : 'button',
    // Text colours for copy that sits on the surface colour rather than the ground.
    onSurface: {
      text: ensureContrast(palette.primary, palette.surface, 4.5),
      muted: ensureContrast(palette.muted, palette.surface, 3.2),
      accent: contrastRatio(palette.accent, palette.surface) >= 2.4 ? palette.accent : ensureContrast(palette.accent, palette.surface, 2.6),
    },
  };

  const archetype = ARCHETYPES[brief.layout] || ARCHETYPES['split-vertical'];
  archetype(ctx);

  return {
    operations: [
      { type: 'SET_CANVAS', changes: { width: canvas.width, height: canvas.height, background: palette.background } },
      ...scene.operations(),
    ],
    elements: scene.elements,
    grid,
    type,
  };
}
