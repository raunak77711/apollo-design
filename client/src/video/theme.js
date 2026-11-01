import { OUTPUT } from './platforms.js';

/**
 * The look and feel of every short, in one place.
 *
 * Nothing in the engine hard-codes a size, a colour, a curve or a duration: it reads them from here. The
 * Director Track only says WHAT happens and WHEN, so changing a number in this file changes every short
 * made by the engine, past and future (re-rendering, which the hash notices).
 *
 * Bump ENGINE_VERSION whenever a change here, or to a component, alters what a viewer sees: renders made by
 * an older engine are then treated as stale.
 */

export const ENGINE_VERSION = 'engine-2';

export const CANVAS = { w: OUTPUT.width, h: OUTPUT.height };
export const FPS = OUTPUT.fps;

export const COLORS = {
  void: '#07090c',
  ink: '#0a0a0a',
  paper: '#ffffff',
  text: '#ffffff',
  muted: 'rgba(255,255,255,0.72)',
  accent: '#ffd84d', //     the active word, the number, the underline
  hot: '#ff5a4d', //        a word the short turns on
  card: '#ffffff',
  cardInk: '#0a0a0a',
  shadow: 'rgba(0,0,0,0.55)',
};

export const FONTS = {
  display: '"Inter", "Geist", system-ui, sans-serif',
  numeric: '"Space Grotesk", "Inter", system-ui, sans-serif',
  mono: '"IBM Plex Mono", ui-monospace, monospace',
};

/** Seconds, and spring settings. Intensity scales every pop together: 1 is the house style. */
export const MOTION = {
  intensity: 1,
  ramp: 0.42, //            how long the layout takes to move between talking and showing a board visual
  cameraRamp: 0.5, //       a punch-in or punch-out
  spring: { damping: 15, stiffness: 150, mass: 0.7 }, //     things that pop in
  gentle: { damping: 22, stiffness: 110, mass: 0.9 }, //     things that settle
  pop: { emphasis: 0.9, number: 1.1, statement: 1.0 }, //     seconds a pop stays fully visible before it leaves
  exit: 0.28, //            seconds a pop takes to leave
  stagger: 0.32, //         progressive reveals: seconds between parts when nothing times them
};

/** The layout of the 1080x1920 canvas, in pixels. */
export const LAYOUT = {
  windowW: CANVAS.w,
  talkCenterY: 880, //      the speaker window sits here while the creator just talks
  talkTop: 475, //          ...but never higher than this, so a tall window still clears the top of the screen
  splitCenterY: 1294, //    ...and here (full frame, smaller) while a board visual is up
  card: { x: 60, y: 262, w: 880, h: 690, radius: 36, pad: 30 }, // inside the universal safe zone: clear of the right-hand buttons
  topZone: { x: 60, y: 262, w: 880, h: 190 }, // emphasis / number / statement are set here
  captionY: 1352, //        centre of the caption block
  captionW: 880,
  background: { blur: 36, dim: 0.5, scale: 1.25 },
};

export const CAPTIONS = {
  fontFamily: FONTS.display,
  fontWeight: 800,
  fontSize: 62,
  lineHeight: 1.14,
  letterSpacing: -0.5,
  color: COLORS.text,
  activeColor: COLORS.accent,
  emphasisColor: COLORS.hot,
  strokeWidth: 9,
  strokeColor: 'rgba(0,0,0,0.92)',
  uppercase: false,
  lead: 0.04, //            a cue appears this long before its first word
  hold: 0.3, //             and stays this long after its last, if nothing replaces it
  maxSeconds: 2.6,
  breakGap: 0.5,
};

export const TYPE = {
  emphasis: { size: 150, weight: 900, tracking: -3 },
  number: { size: 210, weight: 800, tracking: -4, labelSize: 44 },
  statement: { loud: 118, quiet: 84, inverse: 104, weight: 900, tracking: -2 },
};

export const ANNOTATION = { stroke: 7, color: COLORS.accent, underlineGap: 6 };

/** Zoom limits: never so tight that the hands leave the frame. */
export const CAMERA = { minZoom: 1.05, maxZoom: 1.25 };
