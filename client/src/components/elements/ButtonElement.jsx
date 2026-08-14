import { fontStack } from '../../design/fonts.js';
import { strokeFor } from '../../design/strokes.js';

export default function ButtonElement({ element }) {
  const p = element.properties;
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: p.background,
        color: p.color,
        borderRadius: p.borderRadius,
        border: strokeFor(p),
        boxSizing: 'border-box',
        fontFamily: fontStack(p.fontFamily),
        fontSize: p.fontSize,
        fontWeight: p.fontWeight,
        fontStyle: p.italic ? 'italic' : 'normal',
        textDecoration: p.underline ? 'underline' : 'none',
        textTransform: p.textCase && p.textCase !== 'none' ? p.textCase : 'none',
        letterSpacing: `${p.letterSpacing || 0}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        padding: '0 16px',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
      }}
    >
      {p.text}
    </div>
  );
}
