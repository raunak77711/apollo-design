import { fontStack } from '../../design/fonts.js';

export default function TextElement({ element }) {
  const p = element.properties;
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: p.align === 'center' ? 'center' : p.align === 'right' ? 'flex-end' : 'flex-start',
        fontFamily: fontStack(p.fontFamily),
        fontSize: p.fontSize,
        fontWeight: p.fontWeight,
        fontStyle: p.italic ? 'italic' : 'normal',
        textDecoration: p.underline ? 'underline' : 'none',
        textTransform: p.textCase && p.textCase !== 'none' ? p.textCase : 'none',
        color: p.color,
        textAlign: p.align,
        lineHeight: p.lineHeight,
        letterSpacing: `${p.letterSpacing}px`,
        whiteSpace: 'pre-wrap',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {p.text}
    </div>
  );
}
