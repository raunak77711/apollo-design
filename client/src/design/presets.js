/**
 * Canvas formats offered when starting a design. Grouped so the picker can stay
 * scannable, and ordered by how often people reach for them.
 */
export const PRESETS = [
  { id: 'ig-post', name: 'Instagram post', width: 1080, height: 1080, group: 'Social' },
  { id: 'ig-story', name: 'Story', width: 1080, height: 1920, group: 'Social' },
  { id: 'yt-thumb', name: 'YouTube thumbnail', width: 1280, height: 720, group: 'Social' },
  { id: 'banner', name: 'Banner', width: 1200, height: 628, group: 'Marketing' },
  { id: 'ad-square', name: 'Square ad', width: 1080, height: 1350, group: 'Marketing' },
  { id: 'presentation', name: 'Presentation', width: 1920, height: 1080, group: 'Marketing' },
  { id: 'poster', name: 'Poster', width: 1080, height: 1350, group: 'Print' },
  { id: 'flyer', name: 'Flyer A5', width: 1748, height: 2480, group: 'Print' },
  { id: 'menu', name: 'Menu', width: 1200, height: 1800, group: 'Print' },
  { id: 'logo', name: 'Logo', width: 800, height: 800, group: 'Brand' },
  { id: 'invitation', name: 'Invitation', width: 1240, height: 1750, group: 'Brand' },
  { id: 'app-web', name: 'Web page', width: 1440, height: 1024, group: 'Screen' },
];

/** The formats surfaced directly on Home — everything else lives in the dialog. */
export const QUICK_PRESETS = ['ig-post', 'ig-story', 'yt-thumb', 'banner', 'poster'].map((id) =>
  PRESETS.find((p) => p.id === id)
);

export const PRESET_GROUPS = [...new Set(PRESETS.map((p) => p.group))];

export const presetLabel = (p) => `${p.width} × ${p.height}`;

export const findPreset = (id) => PRESETS.find((p) => p.id === id) || null;

/** Names the ratio of an arbitrary canvas, e.g. for the editor's document panel. */
export function ratioLabel(width, height) {
  const divisor = gcd(width, height);
  const w = width / divisor;
  const h = height / divisor;
  if (w > 30 || h > 30) return `${(width / height).toFixed(2)} : 1`;
  return `${w} : ${h}`;
}

function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}
