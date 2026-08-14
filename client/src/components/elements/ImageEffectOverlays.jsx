/**
 * Scene effects that a CSS `filter()` chain cannot express — it can only remap
 * existing pixels, not paint a gradient or a texture on top. Rendered as
 * absolutely-positioned overlay layers inside the same relatively-positioned
 * box as the image. Used by both the live canvas (ImageElement) and the photo
 * editor preview, so what you tune is what you see.
 */

// A small tileable noise texture, generated once and reused for every grained image.
const GRAIN_TILE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E";

export default function ImageEffectOverlays({ properties: p = {}, src, borderRadius }) {
  const vignette = p.vignette ?? 0;
  const bloom = p.bloom ?? 0;
  const glamour = p.glamour ?? 0;
  const grain = p.grain ?? 0;
  if (!vignette && !bloom && !glamour && !grain) return null;

  const radius = borderRadius ?? p.borderRadius ?? 0;

  return (
    <>
      {/* Glamour: an Orton-effect glow — a soft, bright, blurred copy screened on top. */}
      {glamour > 0 && src && (
        <img
          src={src}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          style={{
            borderRadius: radius,
            filter: `blur(${6 + glamour * 0.12}px) brightness(1.25) saturate(1.15)`,
            mixBlendMode: 'screen',
            opacity: Math.min(1, glamour / 140),
          }}
        />
      )}

      {/* Bloom: a soft light source at the centre, screened for a glowing highlight. */}
      {bloom > 0 && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            borderRadius: radius,
            background: 'radial-gradient(ellipse at 50% 45%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 65%)',
            mixBlendMode: 'screen',
            opacity: Math.min(1, bloom / 100),
            filter: 'blur(6px)',
          }}
        />
      )}

      {/* Grain: a tiled noise texture, blended so it reads as texture, not colour. */}
      {grain > 0 && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            borderRadius: radius,
            backgroundImage: `url("${GRAIN_TILE}")`,
            backgroundSize: '120px 120px',
            mixBlendMode: 'overlay',
            opacity: Math.min(0.9, grain / 110),
          }}
        />
      )}

      {/* Vignette: darkened corners, multiplied so midtones stay true. */}
      {vignette > 0 && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            borderRadius: radius,
            background: 'radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.92) 130%)',
            mixBlendMode: 'multiply',
            opacity: Math.min(1, vignette / 100),
          }}
        />
      )}
    </>
  );
}
