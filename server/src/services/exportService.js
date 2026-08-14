import sharp from 'sharp';
import { saveBuffer } from './storageService.js';

/**
 * Render a design document to a raster image using Sharp.
 *
 * Strategy: serialize the document to an SVG (shapes + text), embedding any
 * remote images as base64 data URIs so librsvg can rasterize them, then let
 * Sharp convert the SVG to PNG/JPG/WebP.
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

async function documentToSvg(doc) {
  const { width, height, background } = doc.canvas;
  const ordered = [...doc.elements].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

  const parts = [];
  for (const el of ordered) parts.push(await elementToSvg(el));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="${esc(background)}"/>
  ${parts.join('\n  ')}
</svg>`;
}

async function elementToSvg(el) {
  const p = el.properties || {};
  const transform = el.rotation
    ? ` transform="rotate(${el.rotation} ${el.x + el.width / 2} ${el.y + el.height / 2})"`
    : '';
  const opacity = el.opacity != null ? ` opacity="${el.opacity}"` : '';
  const wrap = (inner) => `<g${transform}${opacity}>${inner}</g>`;

  switch (el.type) {
    case 'rectangle':
      return wrap(
        `<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" rx="${p.borderRadius || 0}" fill="${esc(p.fill)}" ${p.borderWidth ? `stroke="${esc(p.borderColor)}" stroke-width="${p.borderWidth}"` : ''}/>`
      );
    case 'circle':
      return wrap(
        `<ellipse cx="${el.x + el.width / 2}" cy="${el.y + el.height / 2}" rx="${el.width / 2}" ry="${el.height / 2}" fill="${esc(p.fill)}" ${p.borderWidth ? `stroke="${esc(p.borderColor)}" stroke-width="${p.borderWidth}"` : ''}/>`
      );
    case 'line':
      return wrap(
        `<line x1="${el.x}" y1="${el.y + el.height / 2}" x2="${el.x + el.width}" y2="${el.y + el.height / 2}" stroke="${esc(p.stroke)}" stroke-width="${p.strokeWidth || 2}"/>`
      );
    case 'text':
      return wrap(textToSvg(el, p));
    case 'button':
      return wrap(
        `<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" rx="${p.borderRadius || 0}" fill="${esc(p.background)}"/>` +
          `<text x="${el.x + el.width / 2}" y="${el.y + el.height / 2}" font-family="${esc(p.fontFamily || 'Inter, sans-serif')}" font-size="${p.fontSize || 20}" font-weight="${p.fontWeight || 700}" fill="${esc(p.color)}" text-anchor="middle" dominant-baseline="central">${esc(p.text)}</text>`
      );
    case 'icon':
      // Placeholder dot for server export (see file header note).
      return wrap(
        `<circle cx="${el.x + el.width / 2}" cy="${el.y + el.height / 2}" r="${Math.min(el.width, el.height) / 2}" fill="none" stroke="${esc(p.color)}" stroke-width="2"/>`
      );
    case 'image': {
      const href = await processedImageDataUri(p.src, p);
      if (!href) return '';
      const rx = p.borderRadius ? ` rx="${p.borderRadius}"` : '';
      return wrap(
        `<clipPath id="clip-${el.id}"><rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}"${rx}/></clipPath>` +
          `<image href="${href}" x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" preserveAspectRatio="${p.fit === 'contain' ? 'xMidYMid meet' : 'xMidYMid slice'}" clip-path="url(#clip-${el.id})"/>`
      );
    }
    default:
      return '';
  }
}

function textToSvg(el, p) {
  const lines = String(p.text || '').split('\n');
  const anchor = p.align === 'center' ? 'middle' : p.align === 'right' ? 'end' : 'start';
  const tx = p.align === 'center' ? el.x + el.width / 2 : p.align === 'right' ? el.x + el.width : el.x;
  const fontSize = p.fontSize || 32;
  const lineHeight = (p.lineHeight || 1.2) * fontSize;
  const tspans = lines
    .map((line, i) => `<tspan x="${tx}" dy="${i === 0 ? fontSize : lineHeight}">${esc(line)}</tspan>`)
    .join('');
  return `<text y="${el.y}" font-family="${esc(p.fontFamily || 'Inter, sans-serif')}" font-size="${fontSize}" font-weight="${p.fontWeight || 400}" fill="${esc(p.color)}" text-anchor="${anchor}" letter-spacing="${p.letterSpacing || 0}">${tspans}</text>`;
}

/**
 * Fetch an image, apply the same adjustments the browser shows (brightness,
 * contrast, saturation, hue, grayscale, blur) using Sharp, and return a PNG
 * data URI for embedding in the export SVG.
 */
async function processedImageDataUri(src, p = {}) {
  const buf = await fetchImageBuffer(src);
  if (!buf) return null;

  if (!needsProcessing(p)) {
    return `data:image/png;base64,${(await sharp(buf).png().toBuffer()).toString('base64')}`;
  }

  let img = sharp(buf);
  const brightness = (p.brightness ?? 100) / 100;
  const saturation = (p.saturation ?? 100) / 100;
  const hue = Math.round(p.hue ?? 0);
  img = img.modulate({ brightness, saturation, hue });

  // Contrast around the midpoint: out = (in - 128) * c + 128
  const c = (p.contrast ?? 100) / 100;
  if (c !== 1) img = img.linear(c, 128 * (1 - c));

  if ((p.grayscale ?? 0) >= 50) img = img.grayscale();
  if ((p.blur ?? 0) > 0) img = img.blur(Math.max(0.3, p.blur));

  const out = await img.png().toBuffer();
  return `data:image/png;base64,${out.toString('base64')}`;
}

function needsProcessing(p = {}) {
  return (p.brightness ?? 100) !== 100 || (p.contrast ?? 100) !== 100 ||
    (p.saturation ?? 100) !== 100 || (p.hue ?? 0) !== 0 ||
    (p.grayscale ?? 0) !== 0 || (p.blur ?? 0) !== 0;
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

function esc(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
