import { cx } from '../../lib/cx.js';

/**
 * Miniature designs, so Apollo's questions can be answered by eye.
 *
 * Every option asked before a generation is a visual decision, and a row of
 * word-chips makes the user translate "Bold poster" into a picture in their
 * head before they can pick one. These are that picture: a 100×60 artboard
 * drawn in the vocabulary the generator itself works in — a ground, a headline,
 * supporting lines, one shape — set to what each option actually produces.
 *
 * They are illustrations, not previews. The read has to be instant and honest,
 * which is why they stay this crude: anything more detailed would promise a
 * particular layout that the generator never agreed to.
 */

/** One mark on the artboard. Short names because this file is drawing data. */
function M({ x, y, w, h, f, r = 0, o = 1 }) {
  return <rect x={x} y={y} width={w} height={h} rx={r} fill={f} opacity={o} />;
}

/**
 * A 100×60 artboard. The ground is either a literal colour — the style and
 * colour-mood plates describe palettes, so they bring their own — or a Tailwind
 * `fill-*` class, for the plates drawn in the sheet's own ink.
 */
function Plate({ bg, bgClass, className, children }) {
  return (
    <svg
      viewBox="0 0 100 60"
      preserveAspectRatio="xMidYMid slice"
      className={cx('block h-full w-full', className)}
      aria-hidden="true"
    >
      <rect width="100" height="60" fill={bg} className={bgClass} />
      {children}
    </svg>
  );
}

/* --------------------------------- style --------------------------------- */
/* Colour worlds. These carry their own palette because that is most of what a
   direction is — the ground a design stands on and the one colour it spends. */

const STYLE_PLATES = {
  'luxury-editorial': (
    <Plate bg="#EDE8DE">
      <M x={30} y={14} w={40} h={3.4} f="#1B1913" />
      <M x={36} y={22} w={28} h={2} f="#1B1913" o={0.5} />
      <M x={34} y={31} w={32} h={0.7} f="#1B1913" o={0.35} />
      <M x={42} y={38} w={16} h={12} f="#B08D3F" />
    </Plate>
  ),
  'bold-poster': (
    <Plate bg="#0B0B0C">
      <M x={8} y={9} w={84} h={11} f="#FAFAF8" />
      <M x={8} y={23} w={56} h={11} f="#FAFAF8" />
      <M x={8} y={40} w={30} h={9} f="#E4322B" />
    </Plate>
  ),
  'modern-minimal': (
    <Plate bg="#F6F5F2">
      <M x={78} y={9} w={13} h={13} f="#16161A" o={0.12} />
      <M x={10} y={38} w={34} h={3.4} f="#16161A" />
      <M x={10} y={46} w={20} h={2} f="#16161A" o={0.42} />
    </Plate>
  ),
  'vibrant-energetic': (
    <Plate bg="#FF3D7F">
      <M x={9} y={11} w={46} h={14} f="#FFE24D" r={2} />
      <M x={9} y={29} w={62} h={7} f="#FFFFFF" r={1.5} />
      <M x={9} y={40} w={38} h={5} f="#FFFFFF" r={1.5} o={0.6} />
      <M x={70} y={33} w={21} h={21} f="#2E2BFF" r={10.5} />
    </Plate>
  ),
  'tech-futuristic': (
    <Plate bg="#080D18">
      <M x={62} y={8} w={30} h={30} f="#38BDF8" o={0.14} r={2} />
      <M x={62} y={8} w={30} h={2.2} f="#38BDF8" o={0.7} r={1} />
      <M x={9} y={13} w={42} h={6} f="#E6EDF6" />
      <M x={9} y={23} w={30} h={6} f="#E6EDF6" o={0.5} />
      <M x={9} y={35} w={22} h={3} f="#38BDF8" />
      <M x={9} y={47} w={82} h={0.8} f="#38BDF8" o={0.35} />
    </Plate>
  ),
  'warm-organic': (
    <Plate bg="#E9DCC6">
      <M x={57} y={11} w={34} h={38} f="#B5793F" r={17} />
      <M x={9} y={19} w={36} h={5} f="#463323" r={2.5} />
      <M x={9} y={28} w={26} h={3.2} f="#463323" r={1.6} o={0.55} />
      <M x={9} y={41} w={18} h={3.2} f="#7C9A55" r={1.6} />
    </Plate>
  ),
  'playful-bright': (
    <Plate bg="#FFD54A">
      <M x={8} y={8} w={28} h={28} f="#FF5A5F" r={14} />
      <M x={42} y={11} w={46} h={9} f="#1B1B1F" r={4.5} />
      <M x={42} y={24} w={30} h={6} f="#1B1B1F" r={3} o={0.5} />
      <M x={8} y={43} w={80} h={8} f="#2CB67D" r={4} />
    </Plate>
  ),
  'street-urban': (
    <Plate bg="#0A0A0B">
      <M x={5} y={11} w={70} h={12} f="#F2F2F2" />
      <M x={17} y={26} w={66} h={12} f="#F2F2F2" />
      <M x={5} y={42} w={26} h={8} f="#FF2E88" />
      <M x={35} y={42} w={12} h={8} f="#F2F2F2" o={0.3} />
    </Plate>
  ),
  'soft-elegant': (
    <Plate bg="#F3E6E4">
      <M x={31} y={17} w={38} h={2} f="#6A4B4A" />
      <M x={38} y={24} w={24} h={1.4} f="#6A4B4A" o={0.6} />
      <M x={30} y={34} w={40} h={0.6} f="#6A4B4A" o={0.4} />
      <M x={44} y={41} w={12} h={12} f="#C99A96" r={6} />
    </Plate>
  ),
  'corporate-clean': (
    <Plate bg="#FBFBFC">
      <M x={9} y={11} w={44} h={6} f="#12253C" />
      <M x={9} y={21} w={30} h={3} f="#12253C" o={0.45} />
      <M x={9} y={33} w={24} h={16} f="#2563EB" o={0.16} />
      <M x={38} y={33} w={24} h={16} f="#2563EB" o={0.16} />
      <M x={67} y={33} w={24} h={16} f="#2563EB" />
    </Plate>
  ),
};

/* ---------------------------------- tone --------------------------------- */
/* Structure and type voice — a different axis from style, so these are drawn
   in the sheet's own ink. Colour here would say something tone does not. */

const TONE_PLATES = {
  minimal: (
    <>
      <M x={74} y={11} w={14} h={14} f="currentColor" o={0.16} />
      <M x={11} y={36} w={26} h={2.8} f="currentColor" o={0.9} />
      <M x={11} y={43} w={15} h={1.8} f="currentColor" o={0.35} />
    </>
  ),
  bold: (
    <>
      <M x={8} y={12} w={84} h={14} f="currentColor" o={0.92} />
      <M x={8} y={30} w={56} h={14} f="currentColor" o={0.92} />
    </>
  ),
  elegant: (
    <>
      <M x={28} y={18} w={44} h={1.6} f="currentColor" o={0.85} />
      <M x={36} y={25} w={28} h={1.1} f="currentColor" o={0.5} />
      <M x={30} y={37} w={40} h={0.5} f="currentColor" o={0.35} />
      <M x={44} y={44} w={12} h={1.1} f="currentColor" o={0.5} />
    </>
  ),
  playful: (
    <>
      <M x={10} y={15} w={40} h={10} f="currentColor" o={0.9} r={5} />
      <M x={21} y={29} w={51} h={10} f="currentColor" o={0.9} r={5} />
      <M x={74} y={13} w={14} h={14} f="currentColor" o={0.3} r={7} />
      <M x={10} y={43} w={22} h={5} f="currentColor" o={0.3} r={2.5} />
    </>
  ),
};

/* -------------------------------- imagery -------------------------------- */

const IMAGERY_PLATES = {
  photography: (
    <>
      <M x={0} y={0} w={100} h={38} f="#5B7C99" />
      <M x={0} y={22} w={100} h={16} f="#2E4256" />
      <M x={68} y={7} w={13} h={13} f="#FFF3D6" r={6.5} />
      <M x={0} y={30} w={100} h={8} f="#16202B" o={0.55} />
      <M x={9} y={44} w={40} h={4} f="currentColor" o={0.85} />
      <M x={9} y={51} w={24} h={2.6} f="currentColor" o={0.4} />
    </>
  ),
  illustration: (
    <>
      <M x={9} y={40} w={82} h={1.2} f="currentColor" o={0.55} />
      <polygon points="20,40 34,17 48,40" fill="currentColor" opacity="0.8" />
      <polygon points="42,40 58,22 74,40" fill="currentColor" opacity="0.45" />
      <M x={70} y={10} w={14} h={14} f="currentColor" o={0.3} r={7} />
      <M x={9} y={48} w={30} h={3} f="currentColor" o={0.6} />
    </>
  ),
  abstract: (
    <>
      <M x={6} y={9} w={40} h={40} f="currentColor" o={0.75} r={20} />
      <M x={31} y={20} w={44} h={29} f="currentColor" o={0.35} r={14.5} />
      <M x={62} y={7} w={30} h={30} f="currentColor" o={0.5} r={4} />
    </>
  ),
  none: (
    <>
      <M x={9} y={12} w={82} h={9} f="currentColor" o={0.9} />
      <M x={9} y={25} w={62} h={9} f="currentColor" o={0.9} />
      <M x={9} y={40} w={36} h={3} f="currentColor" o={0.35} />
      <M x={9} y={47} w={26} h={3} f="currentColor" o={0.35} />
    </>
  ),
};

/* ------------------------------- colour mood ------------------------------ */
/* The one question whose answer depends on what the user already said: these
   are drawn in the colour Apollo read out of the brief, so "dark" and "vivid"
   are shown in *their* red rather than in the abstract. */

function moodPlate(id, seed) {
  switch (id) {
    case 'light':
      return (
        <Plate bg="#F5F4F1">
          <M x={9} y={13} w={44} h={8} f={seed} />
          <M x={9} y={26} w={30} h={3} f="#16161A" o={0.5} />
          <M x={9} y={38} w={18} h={12} f={seed} o={0.18} />
          <M x={73} y={38} w={18} h={12} f="#16161A" o={0.08} />
        </Plate>
      );
    case 'vivid':
      return (
        <Plate bg={seed}>
          <M x={9} y={12} w={52} h={10} f="#FFFFFF" />
          <M x={9} y={26} w={34} h={4} f="#FFFFFF" o={0.7} />
          <M x={9} y={38} w={22} h={12} f="#0A0A0B" />
          <M x={70} y={9} w={21} h={21} f="#FFFFFF" o={0.25} r={10.5} />
        </Plate>
      );
    case 'muted':
      return (
        <Plate bg="#E7E4DE">
          <M x={0} y={0} w={100} h={60} f={seed} o={0.12} />
          <M x={9} y={13} w={44} h={8} f={seed} o={0.55} />
          <M x={9} y={26} w={30} h={3} f="#3A3833" o={0.45} />
          <M x={9} y={38} w={40} h={9} f="#3A3833" o={0.12} />
        </Plate>
      );
    default:
      return (
        <Plate bg="#0B0B0D">
          <M x={9} y={13} w={44} h={8} f={seed} />
          <M x={9} y={26} w={30} h={3} f="#FFFFFF" o={0.65} />
          <M x={9} y={38} w={22} h={12} f="#FFFFFF" o={0.1} />
          <M x={70} y={9} w={21} h={21} f={seed} o={0.28} r={10.5} />
        </Plate>
      );
  }
}

/* --------------------------------- lookup --------------------------------- */

/**
 * The specimen for one option, or null where a question has nothing to show —
 * the caller falls back to a plain chip rather than drawing an empty artboard.
 */
export function Specimen({ question, value, seed }) {
  if (question === 'style') return STYLE_PLATES[value] || null;
  if (question === 'colorMood') return moodPlate(value, seed || '#E4322B');

  const marks = question === 'tone' ? TONE_PLATES[value] : question === 'imagery' ? IMAGERY_PLATES[value] : null;
  if (!marks) return null;
  return (
    <Plate bgClass="fill-workspace" className="text-ink">
      {marks}
    </Plate>
  );
}

/** Whether a question's options can be drawn at all. */
export const hasSpecimens = (id) => id === 'style' || id === 'tone' || id === 'imagery' || id === 'colorMood';
