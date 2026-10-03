import { connectorPoints } from '../../components/board/engine/geometry.js';
import { ICON_COMPONENTS } from '../../components/board/editor/iconComponents.js';

/**
 * A board scene as SVG: the same pieces the Jam board draws on its canvas (text, boxes, funnel slices, rules,
 * arrows, icons), drawn as vector shapes so each can be animated on its own inside a video frame.
 *
 * `styleOf(item)` supplies per-piece animation: { opacity, scale, dy, stroke } (all optional).
 * Text is real HTML in a foreignObject, so the browser wraps and shapes it exactly as it does on the page.
 */

const family = (f) => (/\s/.test(f.family) ? `"${f.family}"` : f.family);

function Words({ text, font, color, width, height, align = 'center', valign = 'center' }) {
  return (
    <foreignObject x={0} y={0} width={width} height={height} style={{ overflow: 'visible' }}>
      <div
        xmlns="http://www.w3.org/1999/xhtml"
        style={{
          width, height, display: 'flex', alignItems: valign === 'top' ? 'flex-start' : valign === 'bottom' ? 'flex-end' : 'center',
          justifyContent: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center', textAlign: align,
          fontFamily: family(font), fontSize: font.size, fontWeight: font.weight, fontStyle: font.italic ? 'italic' : 'normal',
          letterSpacing: `${(font.letterSpacing || 0) / 1000}em`, lineHeight: font.lineHeight, color, whiteSpace: 'pre-wrap', overflowWrap: 'normal',
        }}
      >
        {text}
      </div>
    </foreignObject>
  );
}

/** Label inside a box or slice, positioned the way the board's renderer places it. */
function Label({ item }) {
  if (!item.label) return null;
  const left = item.labelAlign === 'left';
  const hasTag = Boolean(item.tag) && item.tagAlign === 'bottom-left';
  const w = item.labelWidth;
  const x = left ? -item.w / 2 + item.pad : -w / 2;
  const h = item.h - (hasTag ? item.pad * 2 : 0);
  const y = hasTag ? -item.h / 2 + item.pad : -h / 2 + (item.labelOffsetY || 0);
  return (
    <g transform={`translate(${x} ${y})`}>
      <Words text={item.label} font={item.labelFont} color={item.labelColor} width={w} height={h} align={left ? 'left' : 'center'} valign={hasTag ? 'top' : 'center'} />
    </g>
  );
}

function Tag({ item }) {
  if (!item.tag) return null;
  const right = item.tagAlign === 'right';
  const w = item.w - item.pad * 2;
  const h = item.tagFont.size * 1.5;
  return (
    <g transform={`translate(${right ? item.w / 2 - 16 - w : -item.w / 2 + item.pad} ${right ? -h / 2 : item.h / 2 - item.pad - h})`}>
      <Words text={item.tag} font={item.tagFont} color={item.tagColor} width={w} height={h} align={right ? 'right' : 'left'} valign="bottom" />
    </g>
  );
}

function Icon({ item }) {
  const Component = ICON_COMPONENTS[item.name];
  const glyph = item.disc ? (item.w * 24) / 46 : item.w;
  return (
    <g>
      {item.disc && <circle r={item.w / 2} fill={item.disc} />}
      {Component && <Component x={-glyph / 2} y={-glyph / 2} width={glyph} height={glyph} size={glyph} color={item.color} strokeWidth={2} />}
    </g>
  );
}

function Arrow({ points, item, color }) {
  const { x1, y1, x2, y2, degenerate } = points;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = item.head && !degenerate;
  const size = Math.max(12, item.width * 3.4);
  const hx = x2 - Math.cos(angle) * size * 0.4;
  const hy = y2 - Math.sin(angle) * size * 0.4;
  const left = [x2 - Math.cos(angle - 0.45) * size, y2 - Math.sin(angle - 0.45) * size];
  const right = [x2 - Math.cos(angle + 0.45) * size, y2 - Math.sin(angle + 0.45) * size];
  return (
    <g>
      <line x1={x1} y1={y1} x2={head ? hx : x2} y2={head ? hy : y2} stroke={color} strokeWidth={item.width} strokeLinecap="round" strokeDasharray={item.dashed ? '10 8' : undefined} />
      {head && <polygon points={`${x2},${y2} ${left[0]},${left[1]} ${right[0]},${right[1]}`} fill={color} />}
    </g>
  );
}

export function SceneItem({ item, byId, style = {} }) {
  const { opacity = 1, scale = 1, dy = 0, stroke } = style;
  if (opacity <= 0.001) return null;
  const transform = `translate(${item.cx ?? 0} ${(item.cy ?? 0) + dy}) scale(${scale})`;

  switch (item.kind) {
    case 'text':
      return (
        <g opacity={opacity} transform={transform}>
          <g transform={`translate(${-item.w / 2} ${-item.h / 2})`}>
            <Words text={item.text} font={item.font} color={item.color} width={item.w} height={item.h} align={item.align} />
          </g>
        </g>
      );
    case 'box':
      return (
        <g opacity={opacity} transform={transform}>
          <rect x={-item.w / 2} y={-item.h / 2} width={item.w} height={item.h} rx={item.radius} ry={item.radius} fill={item.fill} stroke={stroke || item.stroke} strokeWidth={item.strokeWidth} strokeDasharray={item.dash ? item.dash.join(' ') : undefined} />
          <Label item={item} />
          <Tag item={item} />
        </g>
      );
    case 'poly':
      return (
        <g opacity={opacity} transform={transform}>
          <polygon points={item.points.map(([x, y]) => `${x},${y}`).join(' ')} fill={item.fill} stroke={stroke || item.stroke || undefined} strokeWidth={item.stroke ? item.strokeWidth || 2 : 0} strokeLinejoin="round" />
          {item.label && <Label item={{ ...item, pad: 0, labelAlign: 'center' }} />}
        </g>
      );
    case 'rule':
      return <line opacity={opacity} x1={item.cx - item.w / 2} y1={item.cy - item.h / 2 + dy} x2={item.cx + item.w / 2} y2={item.cy + item.h / 2 + dy} stroke={item.color} strokeWidth={item.width} strokeLinecap="round" strokeDasharray={item.dashed ? '10 8' : undefined} />;
    case 'connector': {
      const a = byId.get(item.from);
      const b = byId.get(item.to);
      if (!a || !b) return null;
      return (
        <g opacity={opacity}>
          <Arrow points={connectorPoints(a, b, item.gap)} item={item} color={item.color} />
        </g>
      );
    }
    case 'icon':
      return (
        <g opacity={opacity} transform={transform}>
          <Icon item={item} />
        </g>
      );
    default:
      return null;
  }
}
