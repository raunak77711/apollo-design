import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Film, Upload } from 'lucide-react';
import { contentApi } from '../../api/content.js';
import { cx } from '../../lib/cx.js';
import { formatBytes, formatTime } from '../../lib/time.js';
import { useToast } from '../../lib/toast.jsx';
import { Button } from '../../ui/primitives.jsx';

const ACCEPT = 'video/*,audio/*,.mp4,.mov,.m4v,.mkv,.webm';

/**
 * The recording: upload (drop or pick), progress in real bytes, and a player the rest of the page
 * can seek. The player is exposed as `seek(seconds)` so the transcript and the board tally can jump it.
 */
const VideoUpload = forwardRef(function VideoUpload({ session, onUploaded }, ref) {
  const toast = useToast();
  const inputRef = useRef(null);
  const videoRef = useRef(null);
  const abortRef = useRef(null);
  const [progress, setProgress] = useState(null); // { fraction, loaded, total } while uploading
  const [over, setOver] = useState(false);
  const [playerFailed, setPlayerFailed] = useState(false);

  useImperativeHandle(ref, () => ({
    seek(seconds) {
      const v = videoRef.current;
      if (!v) return;
      v.currentTime = Math.max(0, seconds - 0.4); // a beat of lead-in so a word is not clipped
      v.play().catch(() => {});
      v.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
  }));

  const send = async (file) => {
    if (!file) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setPlayerFailed(false);
    setProgress({ fraction: 0, loaded: 0, total: file.size });
    try {
      const updated = await contentApi.uploadVideo(session.id, file, {
        signal: controller.signal,
        onProgress: (fraction, loaded, total) => setProgress({ fraction, loaded, total }),
      });
      onUploaded(updated);
    } catch (err) {
      if (err.name !== 'AbortError') toast.error("Couldn't upload the video", err.message);
    } finally {
      setProgress(null);
      abortRef.current = null;
    }
  };

  const source = session.source;
  const uploading = Boolean(progress);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); send(e.dataTransfer.files?.[0]); }}
      className={cx('rounded-xl border bg-surface p-4 transition-colors', over ? 'border-ink' : 'border-line')}
    >
      <p className="font-mono text-2xs uppercase tracking-[0.2em] text-ink-3">Long-form video</p>

      {source && !uploading && (
        <div className="mt-3">
          {!playerFailed ? (
            <video
              ref={videoRef}
              src={source.url}
              controls
              preload="metadata"
              onError={() => setPlayerFailed(true)}
              className="aspect-video w-full rounded-lg bg-black"
            />
          ) : (
            <div className="flex aspect-video w-full flex-col items-center justify-center gap-1 rounded-lg border border-line bg-raised px-6 text-center">
              <Film size={20} className="text-ink-3" />
              <p className="text-sm text-ink-2">Your browser can't preview this recording.</p>
              <p className="text-xs text-ink-3">Phone video in HEVC often can't play here. Processing and the tally still work.</p>
            </div>
          )}
          <p className="mt-2 truncate text-[13px] text-ink">{source.fileName}</p>
          <p className="text-xs text-ink-3">
            {formatBytes(source.bytes)}
            {session.transcription?.duration ? ` - ${formatTime(session.transcription.duration)}` : ''}
          </p>
        </div>
      )}

      {uploading && (
        <div className="mt-4">
          <div className="h-1.5 overflow-hidden rounded-full bg-raised">
            <div className="h-full rounded-full bg-ink transition-[width] duration-200" style={{ width: `${Math.round(progress.fraction * 100)}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-ink-3">
            <span>
              Uploading {formatBytes(progress.loaded)} of {formatBytes(progress.total)}
            </span>
            <button type="button" onClick={() => abortRef.current?.abort()} className="text-ink-2 hover:text-ink">
              Cancel
            </button>
          </div>
        </div>
      )}

      {!source && !uploading && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-3 flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong text-ink-2 transition-colors hover:border-ink hover:text-ink"
        >
          <Upload size={20} />
          <span className="text-sm">Drop a recording here, or choose a file</span>
          <span className="text-xs text-ink-3">MP4 or MOV, any length</span>
        </button>
      )}

      <div className="mt-3 flex gap-2">
        <Button variant={source ? 'secondary' : 'primary'} onClick={() => inputRef.current?.click()} disabled={uploading || session.transcription?.status === 'processing'}>
          <Upload size={14} />
          {source ? 'Replace video' : 'Upload long-form video'}
        </Button>
        <input ref={inputRef} type="file" accept={ACCEPT} hidden onChange={(e) => { send(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
    </div>
  );
});

export default VideoUpload;
