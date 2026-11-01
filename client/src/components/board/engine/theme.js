/**
 * Jam board — the constants everything else agrees on.
 *
 * The board is a fixed 1400-unit-wide world. Content is centred on x = 700 and
 * text stays inside a ~700-unit safe column so a centred 9:16 crop of a
 * landscape recording still holds the story; wide diagrams are symmetric about
 * the same midline.
 */

export const WORLD_W = 1400;
export const CX = 700;
export const SAFE_W = 700;

export const PAPER = '#ffffff';
export const MUTED = '#6b6b6b';
export const HAIRLINE = '#e5e5e5';
export const STRONG_LINE = '#d4d4d4';
export const SOFT = '#f4f4f2';

/** Tone names come from the model; these are the only colours it ever gets. */
export const TONE_COLORS = {
  ink: '#0a0a0a',
  money: '#0f7a3c',
  problem: '#c81e3a',
  movement: '#1d4ed8',
  tech: '#6b6b6b',
  solution: '#0a0a0a',
};

export const toneColor = (tone) => TONE_COLORS[tone] || TONE_COLORS.ink;

export const FONT_FAMILIES = ['Inter', 'Geist', 'Space Grotesk', 'DM Sans', 'IBM Plex Mono', 'Source Serif 4'];

export const FONT_URL =
  'https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,500;0,600;0,700;0,900;1,400;1,600'
  + '&family=Geist:wght@400;600;700;900&family=Space+Grotesk:wght@500;700&family=DM+Sans:wght@400;600;700'
  + '&family=IBM+Plex+Mono:wght@400;600&family=Source+Serif+4:ital,wght@0,600;1,600&display=swap';

/** Canvas text is measured with whatever font is loaded at that instant, so each face is requested explicitly first. */
export const FONT_PROBES = [
  '400 16px Inter', '600 16px Inter', '700 16px Inter', '900 16px Inter', 'italic 600 16px Inter',
  '400 16px Geist', '700 16px Geist', '900 16px Geist',
  '500 16px "Space Grotesk"', '700 16px "Space Grotesk"',
  '400 16px "DM Sans"', '600 16px "DM Sans"', '700 16px "DM Sans"',
  '400 16px "IBM Plex Mono"', '600 16px "IBM Plex Mono"',
  '600 16px "Source Serif 4"', 'italic 600 16px "Source Serif 4"',
];

const PAD_TOP = [220, 180, 150, 120, 90];
const PAD_BOTTOM = [220, 180, 150, 120, 90];
const GAP = [120, 96, 76, 60, 48];

/** Density 1 is airy, 5 is tight — the "simple → chaos → simple" arc lives here and in the block choices. */
export function spacingFor(density) {
  const i = Math.min(5, Math.max(1, Math.round(density) || 3)) - 1;
  return { padTop: PAD_TOP[i], padBottom: PAD_BOTTOM[i], gap: GAP[i], minHeight: 780 };
}

export const font = (overrides = {}) => ({
  family: 'Inter', size: 32, weight: 700, italic: false, letterSpacing: 0, lineHeight: 1.15, ...overrides,
});
