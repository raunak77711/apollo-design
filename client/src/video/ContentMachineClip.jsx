import React from 'react';
import { AbsoluteFill, OffthreadVideo, useCurrentFrame, useVideoConfig } from 'remotion';

// Trusted HTML/CSS templates, driven by frame time. AI supplies only validated text and cue IDs.
export function ContentMachineClip({ videoSrc, events = [], subtitlePosition = 'lower', layout }) {
  const frame = useCurrentFrame(), { fps, width, height } = useVideoConfig();
  const time = frame / fps;
  const event = events.find(e => time >= e.start && time < e.end);
  const enter = event ? Math.min(1, Math.max(0, (time - event.start) / .24)) : 0;
  const exit = event ? Math.min(1, Math.max(0, (event.end - time) / .2)) : 0;
  const eased = 1 - (1 - enter) ** 3;
  const rect = layout?.animationRect;
  const placement = rect ? { left: rect.x, top: rect.y, width: rect.w } : { left: '8%', right: '18%', top: subtitlePosition === 'upper' ? '65%' : '16%' };
  const textSize = Math.round(Math.min(width * .048, height * .065));
  return <AbsoluteFill style={{ backgroundColor: '#000' }}>
    <OffthreadVideo src={videoSrc} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
    {event && <div style={{ position: 'absolute', ...placement, opacity: Math.min(enter, exit), transform: `translateY(${(1 - eased) * 28}px) scale(${.94 + .06 * eased})`, fontFamily: 'Arial, sans-serif', fontSize: textSize, fontWeight: 800, lineHeight: 1.15, color: '#fff', overflowWrap: 'anywhere' }}>
      <div style={{ display: 'inline-block', maxWidth: '100%', padding: '.45em .6em', borderRadius: '.25em', background: 'rgba(12,20,29,.9)', borderLeft: event.type === 'takeaway' ? '.12em solid #8ce5d5' : undefined, boxShadow: '0 3px 18px rgba(0,0,0,.22)' }}>
        {event.type === 'comparison' ? <div style={{ display: 'flex', alignItems: 'center', gap: '.4em' }}>
          <div style={{ flex: 1, padding: '.4em', border: '2px solid #6d83cf', borderRadius: '.2em', transform: `translateX(${(1 - eased) * -20}px)` }}>{event.left}</div>
          <span style={{ color: '#8ce5d5', opacity: Math.min(1, Math.max(0, (time - event.start - .15) * 4)) }}>→</span>
          <div style={{ flex: 1, padding: '.4em', background: '#28584e', borderRadius: '.2em', opacity: Math.min(1, Math.max(0, (time - event.start - .22) * 4)) }}>{event.right}</div>
        </div> : event.type === 'number' ? <div><div style={{ fontSize: '1.6em', color: '#8ce5d5', letterSpacing: '-.04em' }}>{event.text}</div>{event.label && <div style={{ marginTop: '.3em', fontSize: '.6em', fontWeight: 500 }}>{event.label}</div>}</div> : <span style={{ position: 'relative', display: 'inline', boxDecorationBreak: 'clone', background: event.type === 'keyword' ? `linear-gradient(transparent 65%, rgba(92,157,145,.65) 65%)` : undefined }}>{event.text}</span>}
        {event.type === 'underline' && <div style={{ marginTop: '.16em', height: '.07em', borderRadius: 4, background: '#8ce5d5', transformOrigin: 'left', transform: `scaleX(${eased})` }} />}
      </div>
    </div>}
  </AbsoluteFill>;
}

export const contentMachineMetadata = ({ props }) => ({ width: props.width, height: props.height, fps: 30, durationInFrames: Math.max(1, Math.round(props.duration * 30)) });
