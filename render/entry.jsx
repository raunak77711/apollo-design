import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { Short, shortMetadata } from '../client/src/video/Short.jsx';

/**
 * The Remotion entry point: one composition, "Short". The same component the live preview in the browser
 * plays, fed by the same props (client/src/video/Short.jsx). Everything the picture needs arrives as props.
 */

const defaultProps = {
  title: 'Short',
  fps: 30,
  platform: 'universal',
  videoSrc: '',
  source: { width: 1280, height: 720 },
  framing: { keyframes: [], head: null },
  settings: { aspect: '4:3', handsRoom: 0.35, captions: { enabled: true, maxWords: 4 }, background: 'blur' },
  segments: [{ start: 0, end: 1, clipStart: 0, clipEnd: 1 }],
  duration: 1,
  words: [],
  events: [],
  blocks: {},
};

const Root = () => (
  <Composition id="Short" component={Short} width={1080} height={1920} fps={30} durationInFrames={30} defaultProps={defaultProps} calculateMetadata={shortMetadata} />
);

registerRoot(Root);
