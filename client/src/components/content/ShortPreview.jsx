import { forwardRef, useMemo } from 'react';
import { Player } from '@remotion/player';
import { Short } from '../../video/Short.jsx';

/**
 * The live preview of a short: the very composition the renderer draws, playing in the browser. Edits show up
 * here immediately because there is nothing to render first. It plays the small preview copy of the recording
 * (the original is a multi-gigabyte phone file), so motion and layout are exact while sharpness is not.
 */
const ShortPreview = forwardRef(function ShortPreview({ props, showSafeZones }, ref) {
  const inputProps = useMemo(() => ({ ...props, showSafeZones }), [props, showSafeZones]);
  return (
    <Player
      ref={ref}
      component={Short}
      inputProps={inputProps}
      durationInFrames={Math.max(1, Math.ceil(props.duration * props.fps))}
      fps={props.fps}
      compositionWidth={1080}
      compositionHeight={1920}
      controls
      loop
      clickToPlay
      acknowledgeRemotionLicense
      style={{ width: '100%', aspectRatio: '9 / 16', borderRadius: 14, overflow: 'hidden', background: '#000' }}
    />
  );
});

export default ShortPreview;
