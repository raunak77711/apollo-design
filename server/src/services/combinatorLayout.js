import { PLATFORMS } from './content/platforms.js';
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const intersection = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

export function clipLayout(source, width, height, framing = {}, rules = {}, overlay = false, fit = 'cover') {
  const sw = framing.width || source.width || width, sh = framing.height || source.height || height;
  const ratio = width / height;
  const cw = Math.min(sw, sh * ratio), ch = cw / ratio;
  const head = framing.head || framing.keyframes?.find(k => k.face)?.face;
  const cx = head ? (head.x + head.w / 2) * sw : sw / 2;
  const cy = head ? (head.y + head.h / 2) * sh : sh * .35;
  const crop = { x: Math.round(clamp(cx - cw / 2, 0, sw - cw)), y: Math.round(clamp(cy - ch * .35, 0, sh - ch)), w: Math.floor(cw / 2) * 2, h: Math.floor(ch / 2) * 2 };
  const scale = Math.min(width / sw, height / sh);
  const faces = (framing.keyframes?.filter(k => k.face).map(k => k.face) || []).concat(head ? [head] : []).map(face => fit === 'contain' ? { x: face.x * sw * scale + (width - sw * scale) / 2 - width * .035, y: face.y * sh * scale + (height - sh * scale) / 2 - height * .035, w: face.w * sw * scale + width * .07, h: face.h * sh * scale + height * .07 } : { x: (face.x * sw - crop.x) / crop.w * width - width * .035, y: (face.y * sh - crop.y) / crop.h * height - height * .035, w: face.w * sw / crop.w * width + width * .07, h: face.h * sh / crop.h * height + height * .07 });
  const p = PLATFORMS.tiktok.safe;
  const safe = { x: width * p.left / 1080, y: height * p.top / 1920, w: width * (1080 - p.left - p.right) / 1080, h: height * (1920 - p.top - p.bottom) / 1920 };
  const font = Math.min(width * ({ small: .035, medium: .043, large: .052 }[rules.subtitleSize || 'medium']), height * .065);
  const captionHeight = font * 2.6;
  const captionYs = { lower: safe.y + safe.h - captionHeight, middle: height * .55, upper: safe.y + height * .015 };
  const preference = rules.subtitlePosition || 'auto';
  const positions = preference === 'auto' ? ['lower', 'upper', 'middle'] : [preference];
  const captionRect = positions.map(position => ({ x: safe.x, y: clamp(captionYs[position], safe.y, safe.y + safe.h - captionHeight), w: safe.w, h: captionHeight })).sort((a, b) => faces.reduce((s, f) => s + intersection(a, f) - intersection(b, f), 0))[0];
  let contactRect;
  if (overlay) {
    const h = Math.min(height * .18, width * .22);
    const contactYs = [height * .5, safe.y, safe.y + safe.h - h, ...faces.concat(captionRect).flatMap(o => [o.y + o.h + height * .008, o.y - h - height * .008])];
    contactRect = contactYs.map(y => ({ x: safe.x, y: clamp(y, safe.y, safe.y + safe.h - h), w: safe.w, h })).sort((a, b) => faces.concat(captionRect).reduce((s, o) => s + intersection(a, o) - intersection(b, o), 0))[0];
  }
  const obstacles = [...faces, captionRect, ...(contactRect ? [contactRect] : [])];
  const panelHeight = Math.min(height * (overlay ? .1 : .22), width * .32);
  const yPositions = [safe.y, safe.y + safe.h - panelHeight, ...obstacles.flatMap(o => [o.y + o.h + height * .008, o.y - panelHeight - height * .008]), ...Array.from({ length: 10 }, (_, i) => safe.y + (safe.h - panelHeight) * i / 9)];
  const candidates = yPositions.map(y => ({ x: safe.x, y: clamp(y, safe.y, safe.y + safe.h - panelHeight), w: safe.w, h: panelHeight }));
  const animationRect = candidates.sort((a, b) => obstacles.reduce((s, o) => s + intersection(a, o) - intersection(b, o), 0))[0];
  const occlusionRisk = faces.some(face => intersection(animationRect, face) > 0);
  return { crop, faces, safe, captionRect, animationRect, faceDetected: faces.length > 0, framingMethod: framing.method || 'center fallback', occlusionRisk, ...(contactRect ? { contactRect } : {}) };
}
