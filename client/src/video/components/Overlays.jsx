import { spring, useVideoConfig } from 'remotion';
import { activeWord } from '../captions.js';
import { ANNOTATION, CAPTIONS, COLORS, FONTS, LAYOUT, MOTION, TYPE } from '../theme.js';
import { PLATFORMS, safeRect } from '../platforms.js';
import { ease } from '../timeline.js';

/* --------------------------------- pops --------------------------------- */

/** Fit text into the top zone: shrink until it needs no more than `lines` lines. */
function fitSize(text, size, width, lines = 2, factor = 0.58) {
  let s = size;
  while (s > 52 && Math.ceil((text.length * s * factor) / width) > lines) s *= 0.92;
  return Math.round(s);
}

function usePop(localT, duration) {
  const { fps } = useVideoConfig();
  const enter = spring({ frame: localT * fps, fps, config: MOTION.spring });
  const exit = ease((localT - duration) / MOTION.exit);
  return { scale: (0.7 + 0.3 * enter) * (1 - 0.06 * exit), opacity: Math.min(1, enter * 1.8) * (1 - exit) };
}

const stroke = (px) => `${px}px rgba(0,0,0,0.9)`;

export function EmphasisPop({ event, localT }) {
  const { scale, opacity } = usePop(localT, MOTION.pop.emphasis);
  const text = event.text.toUpperCase();
  const size = fitSize(text, TYPE.emphasis.size, LAYOUT.topZone.w, 1, 0.62);
  return (
    <Zone>
      <div style={{ fontFamily: FONTS.display, fontWeight: TYPE.emphasis.weight, fontSize: size, letterSpacing: TYPE.emphasis.tracking, color: event.strength >= 3 ? COLORS.hot : COLORS.accent, opacity, transform: `scale(${scale})`, WebkitTextStroke: stroke(10), paintOrder: 'stroke fill', textShadow: '0 12px 40px rgba(0,0,0,0.5)', lineHeight: 1 }}>
        {text}
      </div>
    </Zone>
  );
}

export function NumberCallout({ event, localT }) {
  const { scale, opacity } = usePop(localT, event.duration);
  const size = fitSize(event.value, TYPE.number.size, LAYOUT.topZone.w, 1, 0.62);
  return (
    <Zone>
      <div style={{ opacity, transform: `scale(${scale})`, textAlign: 'center' }}>
        <div style={{ fontFamily: FONTS.numeric, fontWeight: TYPE.number.weight, fontSize: size, letterSpacing: TYPE.number.tracking, color: COLORS.accent, WebkitTextStroke: stroke(10), paintOrder: 'stroke fill', lineHeight: 0.95, textShadow: '0 14px 44px rgba(0,0,0,0.55)' }}>{event.value}</div>
        {event.label && <div style={{ marginTop: 6, fontFamily: FONTS.display, fontWeight: 700, fontSize: TYPE.number.labelSize, color: COLORS.text, WebkitTextStroke: stroke(6), paintOrder: 'stroke fill', letterSpacing: 1 }}>{event.label.toUpperCase()}</div>}
      </div>
    </Zone>
  );
}

export function BigStatement({ event, localT }) {
  const { scale, opacity } = usePop(localT, event.duration);
  const inverse = event.style === 'inverse';
  const base = TYPE.statement[event.style] || TYPE.statement.loud;
  const size = fitSize(event.text, base, LAYOUT.topZone.w - (inverse ? 80 : 0), 2, 0.56);
  return (
    <Zone>
      <div
        style={{
          fontFamily: FONTS.display, fontWeight: TYPE.statement.weight, fontSize: size, letterSpacing: TYPE.statement.tracking, lineHeight: 1.04, textAlign: 'center', opacity, transform: `scale(${scale})`,
          ...(inverse ? { background: '#0a0a0a', color: '#fff', padding: '22px 40px', borderRadius: 26 } : { color: event.style === 'quiet' ? COLORS.muted : COLORS.text, WebkitTextStroke: stroke(9), paintOrder: 'stroke fill', textShadow: '0 12px 40px rgba(0,0,0,0.5)' }),
        }}
      >
        {event.text}
      </div>
    </Zone>
  );
}

/** The area above the speaker where emphasis, numbers and statements are set. */
function Zone({ children }) {
  const z = LAYOUT.topZone;
  return <div style={{ position: 'absolute', left: z.x, top: z.y, width: z.w, height: z.h, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{children}</div>;
}

/* -------------------------------- captions ------------------------------- */

/** A word with an annotation (underline / circle / arrow) drawn on it. CSS only: no measuring, so it is the same in every frame. */
function Word({ word, color, scale, annotation }) {
  const base = { display: 'inline-block', position: 'relative', color, transform: `scale(${scale})`, transformOrigin: '50% 80%', margin: '0 0.14em' };
  if (!annotation) return <span style={base}>{word.text}</span>;
  const p = ease(annotation.localT / 0.35);
  const out = ease((annotation.localT - annotation.duration) / MOTION.exit);
  const opacity = 1 - out;
  if (annotation.event.kind === 'circle') {
    return <span style={{ ...base, padding: '0 0.22em', border: `${ANNOTATION.stroke}px solid ${ANNOTATION.color}`, borderRadius: '999px', opacity: 1, boxShadow: `0 0 0 ${(1 - opacity) * 12}px transparent`, clipPath: `inset(-20px ${(1 - p) * 100}% -20px -20px)` }}>{word.text}</span>;
  }
  if (annotation.event.kind === 'arrow') {
    return <span style={base}>{word.text}<span style={{ position: 'absolute', left: 0, right: 0, top: '-1.05em', textAlign: 'center', fontSize: '0.8em', color: ANNOTATION.color, opacity: p * opacity, transform: `translateY(${(1 - p) * -14}px)` }}>↓</span></span>;
  }
  return <span style={{ ...base, backgroundImage: `linear-gradient(${ANNOTATION.color}, ${ANNOTATION.color})`, backgroundRepeat: 'no-repeat', backgroundPosition: `0 calc(100% + ${ANNOTATION.underlineGap}px)`, backgroundSize: `${p * 100}% ${ANNOTATION.stroke}px`, paddingBottom: ANNOTATION.underlineGap + 2, opacity: 1 }}>{word.text}</span>;
}

export function Captions({ cue, t, emphasis, annotations, uppercase = CAPTIONS.uppercase }) {
  if (!cue) return null;
  const active = activeWord(cue.cue, t);
  const byWord = new Map();
  for (const a of annotations) for (let i = a.event.words[0]; i <= a.event.words[1]; i += 1) byWord.set(i, a);
  return (
    <div style={{ position: 'absolute', left: (1080 - LAYOUT.captionW) / 2, width: LAYOUT.captionW, top: LAYOUT.captionY, transform: 'translateY(-50%)', textAlign: 'center' }}>
      <div style={{ fontFamily: CAPTIONS.fontFamily, fontWeight: CAPTIONS.fontWeight, fontSize: CAPTIONS.fontSize, lineHeight: CAPTIONS.lineHeight, letterSpacing: CAPTIONS.letterSpacing, WebkitTextStroke: `${CAPTIONS.strokeWidth}px ${CAPTIONS.strokeColor}`, paintOrder: 'stroke fill', textShadow: '0 8px 26px rgba(0,0,0,0.5)', textTransform: uppercase ? 'uppercase' : 'none' }}>
        {cue.cue.words.map((w, i) => {
          const strength = emphasis.get(w.index) || 0;
          const color = strength >= 3 ? CAPTIONS.emphasisColor : strength > 0 ? CAPTIONS.activeColor : i === active ? CAPTIONS.activeColor : CAPTIONS.color;
          const scale = strength > 0 && i <= active ? 1.12 : 1;
          return <Word key={w.index} word={w} color={color} scale={scale} annotation={byWord.get(w.index)} />;
        })}
      </div>
    </div>
  );
}

/* ------------------------------ safe zones ------------------------------ */

/** The preview's overlay: what each app covers with its own interface. Never part of a render. */
export function SafeZones({ platform = 'universal' }) {
  const p = PLATFORMS[platform] || PLATFORMS.universal;
  const r = safeRect(platform);
  const shade = 'rgba(255,60,60,0.22)';
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 1080, height: p.safe.top, background: shade }} />
      <div style={{ position: 'absolute', left: 0, bottom: 0, width: 1080, height: p.safe.bottom, background: shade }} />
      <div style={{ position: 'absolute', left: 0, top: p.safe.top, width: p.safe.left, height: r.h, background: shade }} />
      <div style={{ position: 'absolute', right: 0, top: p.safe.top, width: p.safe.right, height: r.h, background: shade }} />
      <div style={{ position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, border: '3px dashed rgba(255,255,255,0.8)' }} />
      <div style={{ position: 'absolute', left: r.x + 12, top: r.y + 8, fontFamily: FONTS.mono, fontSize: 24, color: '#fff', background: 'rgba(0,0,0,0.55)', padding: '4px 10px', borderRadius: 6 }}>{p.label} safe area</div>
    </div>
  );
}
