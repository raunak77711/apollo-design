import { AbsoluteFill, OffthreadVideo, Sequence, useVideoConfig } from 'remotion';
import { videoStyle } from '../framing.js';
import { COLORS, LAYOUT } from '../theme.js';

/**
 * The recording itself: the kept stretches played back to back, each a Sequence that starts the source
 * at the right frame, shown through a window that crops it (framing.js) and, behind it, a blurred and
 * dimmed copy that fills the rest of the screen.
 */

function Stretches({ segments, src, fps, muted, style }) {
  return segments.map((s) => (
    <Sequence key={s.clipStart} layout="none" from={Math.round(s.clipStart * fps)} durationInFrames={Math.max(1, Math.round((s.clipEnd - s.clipStart) * fps))}>
      <OffthreadVideo src={src} startFrom={Math.round(s.start * fps)} muted={muted} style={style} />
    </Sequence>
  ));
}

/** What actually plays: the renderer swaps in a pre-cut clip, which must not disturb the source-time lookups used for framing. */
export const playbackOf = (props) => props.playback || { videoSrc: props.videoSrc, segments: props.segments };

export function Background({ props }) {
  const { fps } = useVideoConfig();
  const play = playbackOf(props);
  if (props.settings.background !== 'blur') {
    return <AbsoluteFill style={{ background: `radial-gradient(120% 80% at 50% 30%, #17202b 0%, ${COLORS.void} 70%)` }} />;
  }
  const b = LAYOUT.background;
  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: COLORS.void }}>
      <div style={{ position: 'absolute', inset: 0, filter: `blur(${b.blur}px) brightness(${b.dim})`, transform: `scale(${b.scale})` }}>
        <Stretches segments={play.segments} src={play.videoSrc} fps={fps} muted style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    </AbsoluteFill>
  );
}

export function Speaker({ props, layout }) {
  const { fps } = useVideoConfig();
  const play = playbackOf(props);
  const w = layout.window;
  const style = videoStyle(layout.viewport, w, props.source);
  return (
    <div style={{ position: 'absolute', left: w.x, top: w.y, width: w.w, height: w.h, overflow: 'hidden', boxShadow: '0 24px 70px rgba(0,0,0,0.5)' }}>
      <Stretches segments={play.segments} src={play.videoSrc} fps={fps} muted={false} style={style} />
    </div>
  );
}
