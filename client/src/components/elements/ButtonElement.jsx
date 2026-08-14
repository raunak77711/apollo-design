import { fontStack } from '../../design/fonts.js';

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
        fontFamily: fontStack(p.fontFamily),
        fontSize: p.fontSize,
        fontWeight: p.fontWeight,
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
