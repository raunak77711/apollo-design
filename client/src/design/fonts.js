/**
 * The typefaces offered on the canvas. Kept deliberately short — a curated set
 * that covers editorial, display and utility voices without turning the picker
 * into a font manager.
 */
export const FONTS = [
  { value: 'Inter', label: 'Inter', note: 'Interface', stack: '"Inter", ui-sans-serif, system-ui, sans-serif' },
  { value: 'Instrument Sans', label: 'Instrument Sans', note: 'Display', stack: '"Instrument Sans", "Inter", sans-serif' },
  { value: 'Instrument Serif', label: 'Instrument Serif', note: 'Editorial', stack: '"Instrument Serif", Georgia, serif' },
  { value: 'Playfair Display', label: 'Playfair Display', note: 'Editorial', stack: '"Playfair Display", Georgia, serif' },
  { value: 'Bebas Neue', label: 'Bebas Neue', note: 'Poster', stack: '"Bebas Neue", Impact, sans-serif' },
  { value: 'JetBrains Mono', label: 'JetBrains Mono', note: 'Utility', stack: '"JetBrains Mono", ui-monospace, monospace' },
  { value: 'Georgia', label: 'Georgia', note: 'System serif', stack: 'Georgia, "Times New Roman", serif' },
  { value: 'Arial', label: 'Arial', note: 'System sans', stack: 'Arial, Helvetica, sans-serif' },
];

export const fontStack = (name) =>
  FONTS.find((f) => f.value === name)?.stack || `"${name || 'Inter'}", "Inter", sans-serif`;
