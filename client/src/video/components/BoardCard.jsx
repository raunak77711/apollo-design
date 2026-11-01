import { useMemo } from 'react';
import { spring, useVideoConfig } from 'remotion';
import { layoutBoard } from '../../components/board/engine/layoutBoard.js';
import { groupFromPath, groupPieces, revealTimes } from '../boardScene.js';
import { createCanvasMeasure } from '../measure.js';
import { COLORS, FONTS, LAYOUT, MOTION } from '../theme.js';
import { ease } from '../timeline.js';
import { SceneItem } from './SceneSvg.jsx';

let measurer = null;
const measure = (...args) => {
  if (!measurer) measurer = createCanvasMeasure();
  return measurer(...args);
};

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * One Jam board block, laid out by the board's own engine and animated by the Director Track's intent.
 *   progressive  its parts appear one by one, as the speaker reaches them
 *   reveal       all of it, with a quick cascade
 *   focus        everything dims except one part
 *   highlight    one part pulses
 *   compare      the left side, then the right
 */
export function BoardBlock({ entry, event, localT, hits, ready }) {
  const { fps } = useVideoConfig();
  const built = useMemo(() => {
    if (!ready) return null;
    const spec = { version: 1, title: '', sections: [{ id: entry.sectionId, title: '', density: 3, blocks: [entry.block] }] };
    const scene = layoutBoard(spec, measure);
    const blockId = entry.block.id;
    const items = scene.items.filter((i) => i.block === blockId);
    const bounds = scene.blocks[blockId];
    if (!items.length || !bounds) return null;
    return { items, bounds, byId: new Map(items.map((i) => [i.id, i])), ...groupPieces(items, blockId) };
  }, [entry, ready]);

  if (!built) return null;
  const { items, bounds, byId, pieces, groups, sides } = built;
  const inner = { w: LAYOUT.card.w - LAYOUT.card.pad * 2, h: LAYOUT.card.h - LAYOUT.card.pad * 2 };
  const margin = 24;

  const { times, sideTimes } = revealTimes({ animation: event.animation, groups, sides, hits, eventAt: event.at, duration: event.duration });
  const target = event.part ? groupFromPath(event.part) : 0;
  const dimAt = ease((localT - 0.55) / 0.4);

  const styleOf = (item) => {
    const p = pieces.get(item.id);
    const startAt = event.animation === 'compare' && p.side ? sideTimes.get(p.side) : times.get(p.group) ?? 0;
    const local = localT - startAt;
    if (local < 0) return { opacity: 0 };
    const s = spring({ frame: local * fps, fps, config: MOTION.spring });
    const style = { opacity: Math.min(1, s * 1.6), scale: 0.9 + 0.1 * s, dy: (1 - s) * 16 };
    if (event.animation === 'focus' && target > 0 && p.group !== target && p.group !== 0) style.opacity *= lerp(1, 0.18, dimAt);
    if (event.animation === 'highlight' && target > 0 && p.group === target) {
      const pulse = Math.sin(Math.max(0, localT - 0.5) * 6) * 0.5 + 0.5;
      style.scale *= 1 + 0.07 * pulse * ease((localT - 0.4) / 0.3);
      style.stroke = COLORS.hot;
    }
    return style;
  };

  return (
    <svg width={inner.w} height={inner.h} viewBox={`${bounds.x - margin} ${bounds.y - margin} ${bounds.w + margin * 2} ${bounds.h + margin * 2}`} preserveAspectRatio="xMidYMid meet" style={{ overflow: 'visible' }}>
      {items.map((item) => (
        <SceneItem key={item.id} item={item} byId={byId} style={styleOf(item)} />
      ))}
    </svg>
  );
}

/** Two ideas side by side, for when no board block fits. */
export function ComparisonBody({ event, localT }) {
  const { fps } = useVideoConfig();
  const side = (at) => {
    const s = spring({ frame: Math.max(0, localT - at) * fps, fps, config: MOTION.spring });
    return localT < at ? { opacity: 0, transform: 'scale(0.9)' } : { opacity: Math.min(1, s * 1.6), transform: `scale(${0.9 + 0.1 * s})` };
  };
  const pill = (text, color) => ({
    fontFamily: FONTS.display, fontWeight: 900, fontSize: 92, letterSpacing: -2, color, border: `8px solid ${color}`, borderRadius: 28, padding: '22px 36px', textAlign: 'center', maxWidth: 780, lineHeight: 1.05,
  });
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28 }}>
      <div style={{ ...pill(event.left, '#c81e3a'), ...side(0.1) }}>{event.left}</div>
      <div style={{ fontFamily: FONTS.mono, fontWeight: 600, fontSize: 34, letterSpacing: 10, color: '#6b6b6b', opacity: side(0.5).opacity }}>VERSUS</div>
      <div style={{ ...pill(event.right, '#0f7a3c'), ...side(Math.min(1.6, event.duration * 0.4)) }}>{event.right}</div>
    </div>
  );
}

/** The white board panel that holds a block or a comparison; it slides in as the layout moves. */
export function BoardCard({ amount, event, localT, blocks, hits, ready }) {
  const c = LAYOUT.card;
  const entry = event.type === 'board' ? blocks[event.blockId] : null;
  return (
    <div
      style={{
        position: 'absolute', left: c.x, top: c.y, width: c.w, height: c.h, borderRadius: c.radius, background: COLORS.card,
        boxShadow: '0 30px 80px rgba(0,0,0,0.45)', opacity: amount, transform: `translateY(${(1 - amount) * -70}px) scale(${0.97 + 0.03 * amount})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: c.pad,
      }}
    >
      {event.type === 'comparison' ? <ComparisonBody event={event} localT={localT} /> : entry && <BoardBlock entry={entry} event={event} localT={localT} hits={hits[event.blockId] || []} ready={ready} />}
    </div>
  );
}
