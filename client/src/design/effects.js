/**
 * One-click effect presets, grouped by mood. Each preset is just a bag of the
 * same adjustment properties the Adjust panel edits — nothing special about an
 * "effect" beyond it being a curated starting point you can still fine-tune
 * afterwards. Six presets per category, so browsing stays scannable.
 */
export const EFFECT_CATEGORIES = ['B&W', 'Faded', 'Vintage', 'Tone', 'Portrait', 'Food', 'Urban', 'Nature', 'Vivid', 'Artsy'];

export const EFFECTS = [
  // ---------------------------------------------------------------- B&W ---
  { id: 'bw-classic', label: 'Classic', category: 'B&W', values: { grayscale: 100, contrast: 112, brightness: 102 } },
  { id: 'bw-noir', label: 'Noir', category: 'B&W', values: { grayscale: 100, contrast: 130, black: 25, vignette: 45 } },
  { id: 'bw-soft', label: 'Soft mono', category: 'B&W', values: { grayscale: 90, contrast: 96, white: 10, smooth: 20 } },
  { id: 'bw-silver', label: 'Silver', category: 'B&W', values: { grayscale: 100, contrast: 118, sharpen: 30, clarity: 20 } },
  { id: 'bw-grainy', label: 'Grainy film', category: 'B&W', values: { grayscale: 100, contrast: 108, grain: 45, vignette: 25 } },
  { id: 'bw-highkey', label: 'High key', category: 'B&W', values: { grayscale: 100, brightness: 118, contrast: 90, white: 20 } },

  // -------------------------------------------------------------- Faded ---
  { id: 'faded-dust', label: 'Dust', category: 'Faded', values: { contrast: 82, black: -30, saturation: 85, white: -8 } },
  { id: 'faded-milk', label: 'Milk', category: 'Faded', values: { brightness: 112, contrast: 78, black: -35, white: 15 } },
  { id: 'faded-ash', label: 'Ash', category: 'Faded', values: { saturation: 70, contrast: 85, temperature: -12, grain: 15 } },
  { id: 'faded-paper', label: 'Paper', category: 'Faded', values: { contrast: 80, black: -25, temperature: 10, grain: 25 } },
  { id: 'faded-mist', label: 'Mist', category: 'Faded', values: { contrast: 75, white: 10, smooth: 30, glamour: 20 } },
  { id: 'faded-linen', label: 'Linen', category: 'Faded', values: { saturation: 78, black: -20, temperature: 8, vignette: 15 } },

  // ------------------------------------------------------------ Vintage ---
  { id: 'vintage-70s', label: '70s', category: 'Vintage', values: { temperature: 35, saturation: 88, contrast: 92, vignette: 30, grain: 30 } },
  { id: 'vintage-polaroid', label: 'Polaroid', category: 'Vintage', values: { contrast: 88, white: 12, temperature: 15, vignette: 35, grain: 25 } },
  { id: 'vintage-sepia', label: 'Sepia', category: 'Vintage', values: { grayscale: 40, temperature: 55, contrast: 105, vignette: 20 } },
  { id: 'vintage-super8', label: 'Super 8', category: 'Vintage', values: { contrast: 96, saturation: 82, grain: 55, vignette: 40, temperature: 12 } },
  { id: 'vintage-faded-print', label: 'Faded print', category: 'Vintage', values: { contrast: 84, saturation: 80, black: -20, temperature: 18, grain: 20 } },
  { id: 'vintage-retro', label: 'Retro', category: 'Vintage', values: { temperature: 22, tint: -10, saturation: 92, vignette: 25 } },

  // ---------------------------------------------------------------- Tone --
  { id: 'tone-warm', label: 'Warm', category: 'Tone', values: { temperature: 30, exposure: 6, saturation: 106 } },
  { id: 'tone-cool', label: 'Cool', category: 'Tone', values: { temperature: -30, tint: 6, saturation: 100 } },
  { id: 'tone-gold', label: 'Golden hour', category: 'Tone', values: { temperature: 45, highlights: -15, vignette: 20, glamour: 15 } },
  { id: 'tone-teal-orange', label: 'Teal & orange', category: 'Tone', values: { temperature: 18, tint: -18, contrast: 112, vibrance: 25 } },
  { id: 'tone-moody', label: 'Moody blue', category: 'Tone', values: { temperature: -35, contrast: 116, shadowsTone: -20, black: 15 } },
  { id: 'tone-rosy', label: 'Rosy', category: 'Tone', values: { tint: 20, temperature: 10, highlights: 10, glamour: 10 } },

  // ------------------------------------------------------------ Portrait --
  { id: 'portrait-glow', label: 'Glow', category: 'Portrait', values: { glamour: 35, highlights: -10, vibrance: 15, exposure: 8 } },
  { id: 'portrait-soft', label: 'Soft skin', category: 'Portrait', values: { smooth: 35, clarity: -15, highlights: -8, temperature: 8 } },
  { id: 'portrait-studio', label: 'Studio', category: 'Portrait', values: { contrast: 110, sharpen: 25, shadowsTone: 10, vibrance: 10 } },
  { id: 'portrait-editorial', label: 'Editorial', category: 'Portrait', values: { contrast: 118, clarity: 25, saturation: 92, vignette: 25 } },
  { id: 'portrait-natural', label: 'Natural', category: 'Portrait', values: { vibrance: 12, exposure: 4, temperature: 6, smooth: 10 } },
  { id: 'portrait-dramatic', label: 'Dramatic', category: 'Portrait', values: { contrast: 128, black: 20, shadowsTone: -25, vignette: 40 } },

  // ---------------------------------------------------------------- Food --
  { id: 'food-fresh', label: 'Fresh', category: 'Food', values: { vibrance: 30, brightness: 108, temperature: 6, sharpen: 20 } },
  { id: 'food-rustic', label: 'Rustic', category: 'Food', values: { temperature: 28, contrast: 110, saturation: 92, vignette: 25 } },
  { id: 'food-bright', label: 'Bright & airy', category: 'Food', values: { brightness: 116, white: 15, black: -10, saturation: 100 } },
  { id: 'food-moody', label: 'Moody dish', category: 'Food', values: { contrast: 120, shadowsTone: -20, temperature: 10, vignette: 35 } },
  { id: 'food-vivid', label: 'Vivid bites', category: 'Food', values: { vibrance: 40, contrast: 108, sharpen: 30 } },
  { id: 'food-cafe', label: 'Café', category: 'Food', values: { temperature: 20, contrast: 96, grain: 15, vignette: 20 } },

  // --------------------------------------------------------------- Urban --
  { id: 'urban-concrete', label: 'Concrete', category: 'Urban', values: { saturation: 82, contrast: 118, clarity: 25, temperature: -8 } },
  { id: 'urban-night', label: 'Night streets', category: 'Urban', values: { contrast: 122, black: 20, temperature: -15, bloom: 30 } },
  { id: 'urban-grit', label: 'Grit', category: 'Urban', values: { contrast: 125, clarity: 35, grain: 35, saturation: 88 } },
  { id: 'urban-neon', label: 'Neon', category: 'Urban', values: { vibrance: 35, tint: -15, contrast: 115, bloom: 25 } },
  { id: 'urban-mono-steel', label: 'Steel', category: 'Urban', values: { grayscale: 70, contrast: 120, sharpen: 25 } },
  { id: 'urban-haze', label: 'Haze', category: 'Urban', values: { dehaze: -30, temperature: -10, contrast: 90, white: 10 } },

  // -------------------------------------------------------------- Nature --
  { id: 'nature-lush', label: 'Lush', category: 'Nature', values: { vibrance: 35, saturation: 108, dehaze: 25, sharpen: 15 } },
  { id: 'nature-golden', label: 'Golden field', category: 'Nature', values: { temperature: 30, highlights: -15, vibrance: 20 } },
  { id: 'nature-forest', label: 'Forest', category: 'Nature', values: { temperature: -12, vibrance: 25, shadowsTone: 10, dehaze: 15 } },
  { id: 'nature-coastal', label: 'Coastal', category: 'Nature', values: { temperature: -18, saturation: 106, dehaze: 20, white: 8 } },
  { id: 'nature-autumn', label: 'Autumn', category: 'Nature', values: { temperature: 25, tint: 8, contrast: 108, vibrance: 15 } },
  { id: 'nature-mist', label: 'Morning mist', category: 'Nature', values: { dehaze: -25, white: 15, temperature: -8, glamour: 15 } },

  // --------------------------------------------------------------- Vivid --
  { id: 'vivid-pop', label: 'Pop', category: 'Vivid', values: { vibrance: 45, contrast: 116, sharpen: 20 } },
  { id: 'vivid-electric', label: 'Electric', category: 'Vivid', values: { saturation: 135, contrast: 118, bloom: 15 } },
  { id: 'vivid-candy', label: 'Candy', category: 'Vivid', values: { saturation: 125, tint: 12, brightness: 108 } },
  { id: 'vivid-tropical', label: 'Tropical', category: 'Vivid', values: { vibrance: 40, temperature: 15, saturation: 115 } },
  { id: 'vivid-bold', label: 'Bold', category: 'Vivid', values: { contrast: 130, vibrance: 30, clarity: 20 } },
  { id: 'vivid-neon-glow', label: 'Neon glow', category: 'Vivid', values: { saturation: 130, bloom: 30, contrast: 112 } },

  // --------------------------------------------------------------- Artsy --
  { id: 'artsy-dream', label: 'Dreamy', category: 'Artsy', values: { glamour: 45, bloom: 25, temperature: 12, contrast: 92 } },
  { id: 'artsy-ink', label: 'Ink wash', category: 'Artsy', values: { grayscale: 60, contrast: 130, clarity: 30 } },
  { id: 'artsy-pastel', label: 'Pastel', category: 'Artsy', values: { saturation: 80, brightness: 112, white: 15, tint: 10 } },
  { id: 'artsy-duotone', label: 'Duotone', category: 'Artsy', values: { grayscale: 100, temperature: 40, tint: -25, contrast: 120 } },
  { id: 'artsy-solar', label: 'Solarised', category: 'Artsy', values: { contrast: 140, white: -20, black: 20, saturation: 90 } },
  { id: 'artsy-glitch', label: 'Glitch', category: 'Artsy', values: { tint: -30, saturation: 120, contrast: 125, grain: 30 } },
];

export function effectsInCategory(category) {
  return EFFECTS.filter((e) => category === 'All' || e.category === category);
}
