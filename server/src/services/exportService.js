import sharp from 'sharp';
import { saveBuffer } from './storageService.js';
import { effectiveOpacity, flattenPaint, indexById, inherits, normalizeTree } from '../design/tree.js';
import { pointsAttr, pointsFor } from '../design/shapes.js';

/**
 * Render a design document to a raster image using Sharp.
 *
 * Strategy: serialize the document to an SVG (shapes + text), embedding any
 * remote images as base64 data URIs so librsvg can rasterize them, then let
 * Sharp convert the SVG to PNG/JPG/WebP.
 *
 * The element walk, stacking order and inherited group state come from the same
 * tree helpers the editor uses, so an export is the picture on screen.
 *
 * Known MVP limitation: Lucide icons are rendered as a simple colored dot
 * placeholder in server exports (the browser renders them fully). See README.
 */
export async function exportDesign({ projectId, document, format = 'png', quality = 90 }) {
  const svg = await documentToSvg(document);
  const svgBuffer = Buffer.from(svg);

  let pipeline = sharp(svgBuffer, { density: 144 });
  let ext = 'png';
  if (format === 'jpg' || format === 'jpeg') {
    pipeline = pipeline.flatten({ background: document.canvas.background || '#ffffff' }).jpeg({ quality });
    ext = 'jpg';
  } else if (format === 'webp') {
    pipeline = pipeline.webp({ quality });
    ext = 'webp';
  } else {
    pipeline = pipeline.png();
    ext = 'png';
  }

  const buffer = await pipeline.toBuffer();
  const filename = `design-${Date.now()}.${ext}`;
  return saveBuffer(projectId, 'exports', filename, buffer);
}

/**
 * Rasterize a (typically small, transparent-background) document straight to a
 * PNG data URI without touching disk. Used to flatten/merge a handful of
 * layers into one new image element — an internal editing step, not a
 * user-facing export.
 */
export async function renderToDataUri(document) {
  const svg = await documentToSvg({ ...document, canvas: { ...document.canvas, background: document.canvas.background ?? 'transparent' } });
  const buffer = await sharp(Buffer.from(svg), { density: 144 }).png().toBuffer();
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

async function documentToSvg(input) {
  const doc = normalizeTree(input, { adopt: true });
  const { width, height, background } = doc.canvas;
  const elements = doc.elements;
  const byId = indexById(elements);

  const parts = [];
  for (const { element } of flattenPaint(elements)) {
    // Groups are frames, not marks; hidden layers are not exported at all.
    if (element.type === 'group') continue;
    if (inherits(elements, element, 'hidden', byId)) continue;
    parts.push(await elementToSvg(element, effectiveOpacity(elements, element, byId)));
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="${esc(background)}"/>
  ${parts.filter(Boolean).join('\n  ')}
</svg>`;
}

async function elementToSvg(el, opacity) {
  const p = el.properties || {};
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;

  const moves = [];
  if (el.rotation) moves.push(`rotate(${el.rotation} ${cx} ${cy})`);
  if (el.flipH || el.flipV) {
    moves.push(`translate(${cx} ${cy}) scale(${el.flipH ? -1 : 1} ${el.flipV ? -1 : 1}) translate(${-cx} ${-cy})`);
  }

  const effects = effectsFor(el);
  const attrs = [
    moves.length ? ` transform="${moves.join(' ')}"` : '',
    opacity != null && opacity !== 1 ? ` opacity="${round(opacity)}"` : '',
    effects.id ? ` filter="url(#${effects.id})"` : '',
    el.blendMode && el.blendMode !== 'normal' ? ` style="mix-blend-mode:${esc(el.blendMode)}"` : '',
  ].join('');

  const wrap = (inner) => `<g${attrs}>${effects.def}${inner}</g>`;
  const stroke = strokeAttrs(p);

  switch (el.type) {
    case 'rectangle':
      return wrap(
        `<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" rx="${p.borderRadius || 0}" fill="${esc(p.fill)}" fill-opacity="${p.fillOpacity ?? 1}"${stroke}/>`
      );
    case 'circle':
      return wrap(
        `<ellipse cx="${cx}" cy="${cy}" rx="${el.width / 2}" ry="${el.height / 2}" fill="${esc(p.fill)}" fill-opacity="${p.fillOpacity ?? 1}"${stroke}/>`
      );
    case 'polygon':
    case 'star':
      // Points are inset by half the stroke so the outline stays in frame,
      // exactly as the canvas draws it.
      return wrap(
        `<polygon points="${pointsAttr(pointsFor(el, (p.borderWidth || 0) / 2).map(([x, y]) => [x + el.x, y + el.y]))}" fill="${esc(p.fill)}" fill-opacity="${p.fillOpacity ?? 1}" stroke-linejoin="round"${stroke}/>`
      );
    case 'line': {
      const dash = dashFor(p.strokeStyle, p.strokeWidth || 2);
      return wrap(
        `<line x1="${el.x}" y1="${cy}" x2="${el.x + el.width}" y2="${cy}" stroke="${esc(p.stroke)}" stroke-width="${p.strokeWidth || 2}"${dash}/>`
      );
    }
    case 'text':
      return wrap(textToSvg(el, p));
    case 'button':
      return wrap(
        `<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" rx="${p.borderRadius || 0}" fill="${esc(p.background)}"${stroke}/>` +
          `<text x="${cx}" y="${cy}" font-family="${esc(p.fontFamily || 'Inter, sans-serif')}" font-size="${p.fontSize || 20}" font-weight="${p.fontWeight || 700}"${p.italic ? ' font-style="italic"' : ''}${p.underline ? ' text-decoration="underline"' : ''} letter-spacing="${p.letterSpacing || 0}" fill="${esc(p.color)}" text-anchor="middle" dominant-baseline="central">${esc(applyCase(p.text, p.textCase))}</text>`
      );
    case 'icon':
      // Placeholder dot for server export (see file header note).
      return wrap(
        `<circle cx="${cx}" cy="${cy}" r="${Math.min(el.width, el.height) / 2}" fill="none" stroke="${esc(p.color)}" stroke-width="2"/>`
      );
    case 'image': {
      const image = await processedImage(p.src, p);
      if (!image) return '';
      const rx = p.borderRadius ? ` rx="${p.borderRadius}"` : '';
      const box = imageBox(el, p, image);
      return wrap(
        `<clipPath id="clip-${el.id}"><rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}"${rx}/></clipPath>` +
          `<image href="${image.href}" x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" preserveAspectRatio="${box.fit}" clip-path="url(#clip-${el.id})"/>`
      );
    }
    default:
      return '';
  }
}

/** Shadow and layer blur, mirroring the CSS filters the canvas applies. */
function effectsFor(el) {
  if (!el.shadow && !el.layerBlur) return { id: '', def: '' };
  const id = `fx-${el.id}`;
  const primitives = [];
  if (el.layerBlur) primitives.push(`<feGaussianBlur stdDeviation="${el.layerBlur / 2}"/>`);
  if (el.shadow) {
    const { color, alpha } = splitAlpha(el.shadow.color);
    // CSS drop-shadow takes a blur radius; SVG takes a deviation — half of it.
    primitives.push(
      `<feDropShadow dx="${el.shadow.x || 0}" dy="${el.shadow.y || 0}" stdDeviation="${(el.shadow.blur || 0) / 2}" flood-color="${esc(color)}" flood-opacity="${alpha}"/>`
    );
  }
  return {
    id,
    def: `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%">${primitives.join('')}</filter>`,
  };
}

function strokeAttrs(p) {
  if (!p.borderWidth) return '';
  return ` stroke="${esc(p.borderColor || '#000')}" stroke-width="${p.borderWidth}"${dashFor(p.strokeStyle, p.borderWidth)}`;
}

function dashFor(style, width) {
  if (style === 'dashed') return ` stroke-dasharray="${width * 3} ${width * 2}"`;
  if (style === 'dotted') return ` stroke-dasharray="${width} ${width * 2}" stroke-linecap="round"`;
  return '';
}

function applyCase(value, mode) {
  const text = String(value ?? '');
  if (mode === 'uppercase') return text.toUpperCase();
  if (mode === 'lowercase') return text.toLowerCase();
  if (mode === 'capitalize') return text.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
  return text;
}

function textToSvg(el, p) {
  const lines = applyCase(p.text, p.textCase).split('\n');
  const anchor = p.align === 'center' ? 'middle' : p.align === 'right' ? 'end' : 'start';
  const tx = p.align === 'center' ? el.x + el.width / 2 : p.align === 'right' ? el.x + el.width : el.x;
  const fontSize = p.fontSize || 32;
  const lineHeight = (p.lineHeight || 1.2) * fontSize;
  const tspans = lines
    .map((line, i) => `<tspan x="${tx}" dy="${i === 0 ? fontSize : lineHeight}">${esc(line)}</tspan>`)
    .join('');
  const style = `${p.italic ? ' font-style="italic"' : ''}${p.underline ? ' text-decoration="underline"' : ''}`;
  return `<text y="${el.y}" font-family="${esc(p.fontFamily || 'Inter, sans-serif')}" font-size="${fontSize}" font-weight="${p.fontWeight || 400}"${style} fill="${esc(p.color)}" text-anchor="${anchor}" letter-spacing="${p.letterSpacing || 0}">${tspans}</text>`;
}

/**
 * Where the bitmap actually lands. For a cropped image the browser does
 * `object-fit: cover` plus a focal point and a zoom; the same rectangle is
 * computed here so the export frames the picture identically.
 */
function imageBox(el, p, image) {
  const fit = p.fit || 'cover';
  if (fit === 'fill') return { x: el.x, y: el.y, width: el.width, height: el.height, fit: 'none' };
  if (fit === 'contain') return { x: el.x, y: el.y, width: el.width, height: el.height, fit: 'xMidYMid meet' };
  if (!image.width || !image.height) {
    return { x: el.x, y: el.y, width: el.width, height: el.height, fit: 'xMidYMid slice' };
  }

  const zoom = Math.max(1, p.zoom ?? 1);
  const scale = Math.max(el.width / image.width, el.height / image.height) * zoom;
  const width = image.width * scale;
  const height = image.height * scale;
  const fx = (p.focalX ?? 50) / 100;
  const fy = (p.focalY ?? 50) / 100;

  return {
    x: round(el.x + (el.width - width) * fx),
    y: round(el.y + (el.height - height) * fy),
    width: round(width),
    height: round(height),
    fit: 'none',
  };
}

/**
 * Fetch an image and apply adjustments with Sharp, returning a PNG data URI
 * plus its pixel size for framing.
 *
 * brightness/contrast/saturation/hue/grayscale/blur/sharpen and vignette are
 * applied for real. vibrance/temperature/tint/exposure/black/white/
 * highlights/shadowsTone/clarity/dehaze/smooth are folded into
 * brightness/contrast/saturation with the SAME formula the client preview
 * uses (design/imageFilters.js#cssImageFilter), so the export closely matches
 * what was previewed even though Sharp has no direct primitive for them.
 * grain/bloom/glamour are preview-only — see README.
 */
async function processedImage(src, p = {}) {
  const buf = await fetchImageBuffer(src);
  if (!buf) return null;

  let img = sharp(buf);
  if (needsProcessing(p)) {
    const brightnessPct = (p.brightness ?? 100)
      + (p.exposure ?? 0) * 0.8 + (p.white ?? 0) * 0.15 - (p.black ?? 0) * 0.15 + (p.highlights ?? 0) * 0.1;
    const contrastPct = (p.contrast ?? 100)
      + (p.white ?? 0) * 0.25 + (p.black ?? 0) * 0.25 + (p.clarity ?? 0) * 0.3 + (p.sharpen ?? 0) * 0.15
      - (p.shadowsTone ?? 0) * 0.1;
    const saturationPct = (p.saturation ?? 100)
      + (p.vibrance ?? 0) * 0.6 + (p.dehaze ?? 0) * 0.2 + Math.abs(p.temperature ?? 0) * 0.1;
    const huePlusTemp = Math.round((p.hue ?? 0) + (p.temperature ?? 0) * -0.4 + (p.tint ?? 0) * 0.3);

    img = img.modulate({
      brightness: Math.max(0.1, brightnessPct / 100),
      saturation: Math.max(0, saturationPct / 100),
      hue: huePlusTemp,
    });

    // Contrast around the midpoint: out = (in - 128) * c + 128
    const c = Math.max(0, contrastPct) / 100;
    if (c !== 1) img = img.linear(c, 128 * (1 - c));

    if ((p.grayscale ?? 0) >= 50) img = img.grayscale();
    if ((p.sharpen ?? 0) > 0) img = img.sharpen({ sigma: 0.5 + (p.sharpen / 100) * 2.5 });

    const blur = (p.blur ?? 0) + (p.smooth ?? 0) * 0.06;
    if (blur > 0) img = img.blur(Math.max(0.3, blur));
  }

  let { data, info } = await img.png().toBuffer({ resolveWithObject: true });
  if ((p.vignette ?? 0) > 0) data = await applyVignette(data, info.width, info.height, p.vignette);

  return { href: `data:image/png;base64,${data.toString('base64')}`, width: info.width, height: info.height };
}

/** A real darkened-corners composite, matching the CSS radial-gradient overlay used in the editor. */
async function applyVignette(pngBuffer, width, height, strength) {
  const opacity = Math.min(1, strength / 100) * 0.92;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><radialGradient id="v" cx="50%" cy="50%" r="75%">
      <stop offset="35%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="${opacity}"/>
    </radialGradient></defs>
    <rect width="100%" height="100%" fill="url(#v)"/>
  </svg>`;
  const overlay = await sharp(Buffer.from(svg)).png().toBuffer();
  return sharp(pngBuffer).composite([{ input: overlay, blend: 'multiply' }]).png().toBuffer();
}

function needsProcessing(p = {}) {
  const zeroed = ['hue', 'grayscale', 'blur', 'vibrance', 'temperature', 'tint', 'exposure', 'black', 'white',
    'highlights', 'shadowsTone', 'clarity', 'dehaze', 'sharpen', 'smooth'];
  const hundred = ['brightness', 'contrast', 'saturation'];
  return hundred.some((k) => (p[k] ?? 100) !== 100) || zeroed.some((k) => (p[k] ?? 0) !== 0);
}

async function fetchImageBuffer(src) {
  if (!src) return null;
  try {
    if (src.startsWith('data:')) {
      const base64 = src.split(',')[1] || '';
      return Buffer.from(base64, 'base64');
    }
    const res = await fetch(src);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** Shadow colours carry their alpha as #RRGGBBAA; SVG wants the two apart. */
function splitAlpha(value) {
  const match = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(String(value || '').trim());
  if (!match) return { color: '#000000', alpha: 0.35 };
  return { color: `#${match[1]}`, alpha: match[2] ? parseInt(match[2], 16) / 255 : 1 };
}

const round = (n) => Math.round(n * 100) / 100;

function esc(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
