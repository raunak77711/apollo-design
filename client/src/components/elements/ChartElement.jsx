/**
 * A chart draws its own geometry from `data` — the model directs a small
 * dataset, this plots it. No AI ever emits a bar height or a slice angle.
 *
 * Follows the same viewBox-per-element convention as `PolyElement`/`LineElement`
 * so it resizes, rotates and exports exactly like every other shape.
 */
export default function ChartElement({ element }) {
  const p = element.properties || {};
  const { width, height } = element;
  const data = Array.isArray(p.data) && p.data.length >= 2 ? p.data : [{ label: 'A', value: 1 }, { label: 'B', value: 1 }];
  const color = p.color || '#D9A441';
  const labelColor = p.labelColor || '#FFFFFF';

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ display: 'block', overflow: 'visible' }}
      aria-hidden="true"
    >
      {p.chartType === 'donut' ? (
        <Donut width={width} height={height} data={data} color={color} labelColor={labelColor} />
      ) : p.chartType === 'line' ? (
        <LineChart width={width} height={height} data={data} color={color} labelColor={labelColor} showValues={p.showValues} />
      ) : (
        <BarChart width={width} height={height} data={data} color={color} labelColor={labelColor} showValues={p.showValues} />
      )}
    </svg>
  );
}

const fontSize = (height, fraction, min = 8, max = 22) => Math.max(min, Math.min(max, height * fraction));

function truncate(label, chars) {
  return label.length > chars ? `${label.slice(0, chars - 1)}…` : label;
}

function BarChart({ width, height, data, color, labelColor, showValues }) {
  const labelH = height * 0.16;
  const valueH = showValues ? height * 0.14 : height * 0.04;
  const top = valueH;
  const bottom = height - labelH;
  const plotH = Math.max(1, bottom - top);
  const max = Math.max(...data.map((d) => d.value), 1);
  const slot = width / data.length;
  const barW = slot * 0.56;
  const size = fontSize(height, 0.055);
  const charW = size * 0.58;

  return (
    <>
      {data.map((d, i) => {
        const barH = (d.value / max) * plotH;
        const x = i * slot + (slot - barW) / 2;
        const y = bottom - barH;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={Math.max(1, barH)} rx={Math.min(6, barW * 0.12)} fill={color} fillOpacity={0.55 + 0.45 * ((i % 4) / 4)} />
            {showValues && (
              <text x={x + barW / 2} y={top - size * 0.4} textAnchor="middle" fontSize={size} fill={labelColor} fontFamily="Inter, sans-serif" fontWeight={600}>
                {Math.round(d.value)}
              </text>
            )}
            <text x={x + barW / 2} y={height - labelH * 0.3} textAnchor="middle" fontSize={size} fill={labelColor} fontFamily="Inter, sans-serif" opacity={0.8}>
              {truncate(d.label, Math.max(3, Math.round(slot / charW)))}
            </text>
          </g>
        );
      })}
    </>
  );
}

function LineChart({ width, height, data, color, labelColor, showValues }) {
  const labelH = height * 0.16;
  const valueH = showValues ? height * 0.14 : height * 0.06;
  const top = valueH;
  const bottom = height - labelH;
  const plotH = Math.max(1, bottom - top);
  const max = Math.max(...data.map((d) => d.value), 1);
  const min = Math.min(...data.map((d) => d.value), 0);
  const range = Math.max(1, max - min);
  const size = fontSize(height, 0.055);
  const step = data.length > 1 ? width / (data.length - 1) : width;

  const points = data.map((d, i) => ({
    x: i * step,
    y: bottom - ((d.value - min) / range) * plotH,
    ...d,
  }));
  const path = points.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');

  return (
    <>
      <path d={path} fill="none" stroke={color} strokeWidth={Math.max(2, height * 0.012)} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((pt, i) => (
        <g key={i}>
          <circle cx={pt.x} cy={pt.y} r={Math.max(2.5, height * 0.014)} fill={color} />
          {showValues && (
            <text x={pt.x} y={pt.y - height * 0.03} textAnchor="middle" fontSize={size} fill={labelColor} fontFamily="Inter, sans-serif" fontWeight={600}>
              {Math.round(pt.value)}
            </text>
          )}
          <text x={pt.x} y={height - labelH * 0.3} textAnchor="middle" fontSize={size} fill={labelColor} fontFamily="Inter, sans-serif" opacity={0.8}>
            {truncate(pt.label, 8)}
          </text>
        </g>
      ))}
    </>
  );
}

function Donut({ width, height, data, color, labelColor }) {
  const legendRows = Math.min(data.length, 6);
  const legendH = height * 0.13 * legendRows;
  const plotH = height - legendH;
  const cx = width / 2;
  const cy = plotH / 2;
  const r = Math.min(width, plotH) * 0.42;
  const inner = r * 0.58;

  const total = Math.max(1, data.reduce((sum, d) => sum + d.value, 0));
  let angle = -Math.PI / 2;
  const slices = data.map((d, i) => {
    const sweep = (d.value / total) * Math.PI * 2;
    const start = angle;
    const end = angle + sweep;
    angle = end;
    return { ...d, start, end, opacity: 0.5 + 0.5 * (1 - (i % 5) / 5) };
  });

  const arc = (startAngle, endAngle) => {
    const large = endAngle - startAngle > Math.PI ? 1 : 0;
    const p = (radius, a) => [cx + radius * Math.cos(a), cy + radius * Math.sin(a)];
    const [x0, y0] = p(r, startAngle);
    const [x1, y1] = p(r, endAngle);
    const [x2, y2] = p(inner, endAngle);
    const [x3, y3] = p(inner, startAngle);
    return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${inner} ${inner} 0 ${large} 0 ${x3} ${y3} Z`;
  };

  const legendSize = fontSize(height, 0.05);
  const swatch = legendSize * 0.85;

  return (
    <>
      {slices.map((s, i) => (
        <path key={i} d={arc(s.start, s.end)} fill={color} fillOpacity={s.opacity} />
      ))}
      {data.slice(0, legendRows).map((d, i) => {
        const rowY = plotH + i * (legendH / legendRows) + legendH / legendRows / 2;
        return (
          <g key={i}>
            <rect x={width * 0.06} y={rowY - swatch / 2} width={swatch} height={swatch} rx={2} fill={color} fillOpacity={slices[i].opacity} />
            <text x={width * 0.06 + swatch * 1.6} y={rowY + legendSize * 0.35} fontSize={legendSize} fill={labelColor} fontFamily="Inter, sans-serif">
              {truncate(d.label, 22)}
            </text>
          </g>
        );
      })}
    </>
  );
}
