import { useMemo } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { cueAt, groupCaptions } from './captions.js';
import { BoardCard } from './components/BoardCard.jsx';
import { BigStatement, Captions, EmphasisPop, NumberCallout, SafeZones } from './components/Overlays.jsx';
import { Background, Speaker } from './components/Speaker.jsx';
import { useEngineFonts } from './measure.js';
import { COLORS, FONTS } from './theme.js';
import { annotationsAt, emphasisByWord, layoutAt, popsAt } from './timeline.js';

/**
 * One short, as a Remotion composition. Everything it draws comes from its props (the Director Track, the
 * words, the framing, the board blocks it needs), so the live preview in the browser and the final render
 * in Chrome are the same code looking at the same data.
 *
 * Layers, bottom to top: blurred background, the speaker, the board card, the pops above the speaker
 * (emphasis, a number, a statement), captions, and - preview only - the platform safe zones.
 */

export function Short(props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const ready = useEngineFonts();
  const { events, words, settings, blocks } = props;

  const cues = useMemo(() => groupCaptions(words, { maxWords: settings.captions.maxWords }), [words, settings.captions.maxWords]);
  const emphasis = useMemo(() => emphasisByWord(events), [events]);
  const hits = useMemo(() => Object.fromEntries(Object.entries(blocks).map(([id, b]) => [id, b.hits || []])), [blocks]);

  const layout = layoutAt(t, props);
  const showPops = layout.card.amount < 0.2;
  const cue = settings.captions.enabled ? cueAt(cues, t) : null;

  return (
    <AbsoluteFill style={{ background: COLORS.void, fontFamily: FONTS.display, overflow: 'hidden' }}>
      <Background props={props} />
      <Speaker props={props} layout={layout} />

      {layout.card.event && layout.card.amount > 0.001 && <BoardCard amount={layout.card.amount} event={layout.card.event} localT={layout.card.localT} blocks={blocks} hits={hits} ready={ready} />}

      {ready && showPops && popsAt(events, t).map(({ event, localT }) => {
        if (event.type === 'number') return <NumberCallout key={event.id} event={event} localT={localT} />;
        if (event.type === 'statement') return <BigStatement key={event.id} event={event} localT={localT} />;
        // Only the word a short turns on gets the big pop; lesser emphasis lives in the captions.
        return event.strength >= 3 ? <EmphasisPop key={event.id} event={event} localT={localT} /> : null;
      })}

      {ready && <Captions cue={cue} t={t} emphasis={emphasis} annotations={annotationsAt(events, t)} />}
      {props.showSafeZones && <SafeZones platform={props.platform} />}
    </AbsoluteFill>
  );
}

export const shortMetadata = ({ props }) => ({
  durationInFrames: Math.max(1, Math.ceil(props.duration * props.fps)),
  fps: props.fps,
  width: 1080,
  height: 1920,
});
