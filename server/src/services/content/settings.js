import { PLATFORM_IDS } from './platforms.js';

/**
 * Per-recording editing settings. Everything here is a choice a person makes once and expects to hold for
 * every short from that recording; per-short tweaks live on the short.
 *
 *   aiDirector   DeepSeek directs each short's edit (emphasis, board visuals, camera). Off: the rule-based
 *                baseline does, with no model and no cost. Either way the edit can be changed by hand.
 *   framing      how the horizontal recording is cropped for 9:16. `aspect` is the shape of the window cut
 *                from the frame: wide enough that hand movement stays in view, never a tight face crop.
 *                `handsRoom` (0-1) leans the window from the face toward the middle of the frame, where the
 *                hands are.
 *   platform     whose interface the safe zones keep clear ("universal" = the strictest of all).
 *   captions     on/off and how many words show at once.
 *   background   what fills the screen around the speaker.
 */

export const ASPECTS = { '1:1': 1, '4:5': 0.8, '4:3': 4 / 3, '3:2': 1.5, '16:9': 16 / 9 };

export const DEFAULT_SETTINGS = {
  aiDirector: true,
  framing: { aspect: '4:3', handsRoom: 0.35 },
  platform: 'universal',
  captions: { enabled: true, maxWords: 4 },
  background: 'blur',
};

const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);
const clamp = (v, lo, hi, fallback) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : fallback);

/** current + a patch from the browser -> valid settings. Unknown keys are ignored, bad values keep the old one. */
export function mergeSettings(current = {}, patch = {}) {
  const base = { ...DEFAULT_SETTINGS, ...current, framing: { ...DEFAULT_SETTINGS.framing, ...(current.framing || {}) }, captions: { ...DEFAULT_SETTINGS.captions, ...(current.captions || {}) } };
  const next = structuredClone(base);
  if (typeof patch.aiDirector === 'boolean') next.aiDirector = patch.aiDirector;
  if (patch.framing) {
    next.framing.aspect = oneOf(patch.framing.aspect, Object.keys(ASPECTS), base.framing.aspect);
    next.framing.handsRoom = clamp(patch.framing.handsRoom, 0, 1, base.framing.handsRoom);
  }
  if (patch.platform !== undefined) next.platform = oneOf(patch.platform, PLATFORM_IDS, base.platform);
  if (patch.captions) {
    if (typeof patch.captions.enabled === 'boolean') next.captions.enabled = patch.captions.enabled;
    next.captions.maxWords = Math.round(clamp(patch.captions.maxWords, 2, 6, base.captions.maxWords));
  }
  if (patch.background !== undefined) next.background = oneOf(patch.background, ['blur', 'solid'], base.background);
  return next;
}
