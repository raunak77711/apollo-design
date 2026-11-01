import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
export const mediaExtensions = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi', '.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac']);
// Lazy Fisher-Yates: mix the pool without building every clip tuple in memory.
export function* mixedCombinationIndices(total, choose = limit => Math.floor(Math.random() * limit)) {
  const swaps = new Map();
  for (let remaining = total; remaining > 0; remaining--) {
    const pick = choose(remaining);
    const index = swaps.get(pick) ?? pick;
    swaps.set(pick, swaps.get(remaining - 1) ?? remaining - 1);
    swaps.delete(remaining - 1);
    yield index;
  }
}
export function combinationAt(groups, index) {
  const total = groups.hooks.length * groups.bodies.length * groups.ctas.length;
  if (!Number.isSafeInteger(total) || !Number.isInteger(index) || index < 0 || index >= total) throw new Error('Invalid combination index or count.');
  return [groups.hooks[Math.floor(index / (groups.bodies.length * groups.ctas.length))], groups.bodies[Math.floor(index / groups.ctas.length) % groups.bodies.length], groups.ctas[index % groups.ctas.length]];
}
export const clipIdentity = (clip, role) => role === 'hooks' && clip.audioIdentity ? `audio:${clip.audioIdentity}` : clip.sha256;

// Balance hooks within the batch before reuse, then prefer the least-used sources in history.
export function selectFreshCombinations(groups, clips, used, count, keyFor) {
  const roles = ['hooks', 'bodies', 'ctas'];
  const history = roles.map(() => new Map()), batch = roles.map(() => new Map());
  for (const tuple of used.values()) tuple.forEach((hash, r) => history[r].set(hash, (history[r].get(hash) || 0) + 1));
  const identity = (id, r) => clipIdentity(clips[id], roles[r]);
  const indexes = roles.map(role => new Map(groups[role].map((id, i) => [id, i])));
  const selection = [];
  let previous = used.lastTuple || [];
  while (selection.length < count) {
    const ordered = roles.map((role, r) => [...groups[role]].sort((a, b) => {
      const x = identity(a, r), y = identity(b, r);
      return (batch[r].get(x) || 0) - (batch[r].get(y) || 0) || (history[r].get(x) || 0) - (history[r].get(y) || 0) || Number(x === previous[r]) - Number(y === previous[r]);
    }));
    let chosen;
    for (let pass = 0; pass < 2 && !chosen; pass++) {
      search: for (const hook of ordered[0]) for (const body of ordered[1]) {
        if (!pass && groups.bodies.length > 1 && identity(body, 1) === previous[1]) continue;
        for (const cta of ordered[2]) {
          const ids = [hook, body, cta], key = keyFor(ids, clips);
          if (used.has(key)) continue;
          chosen = { ids, key }; break search;
        }
      }
    }
    if (!chosen) break;
    const tuple = chosen.ids.map(identity);
    used.set(chosen.key, tuple);
    tuple.forEach((hash, r) => batch[r].set(hash, (batch[r].get(hash) || 0) + 1));
    const [h, b, c] = chosen.ids.map((id, r) => indexes[r].get(id));
    selection.push({ index: (h * groups.bodies.length + b) * groups.ctas.length + c, key: chosen.key });
    previous = tuple;
  }
  return selection;
}
export async function probe(file) {
  const { stdout } = await exec(process.env.FFPROBE_PATH || 'ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { maxBuffer: 4 * 1024 ** 2 });
  const info = JSON.parse(stdout);
  const duration = Number(info.format?.duration);
  const video = info.streams.find(s => s.codec_type === 'video' && !s.disposition?.attached_pic);
  const audio = info.streams.some(s => s.codec_type === 'audio');
  if ((!video && !audio) || !Number.isFinite(duration) || duration <= 0) throw new Error('File has no playable media or duration.');
  const rotation = Number(video?.side_data_list?.find(s => s.rotation !== undefined)?.rotation || 0);
  const rotated = Math.abs(rotation) % 180 === 90;
  return { duration, video: !!video, audio, ...(video ? { width: rotated ? video.height : video.width, height: rotated ? video.width : video.height } : {}) };
}
export async function fingerprintAudio(file) {
  const { stdout, stderr } = await exec(process.env.FFMPEG_PATH || 'ffmpeg', ['-hide_banner', '-i', file, '-vn', '-af', 'aresample=16000,aformat=sample_fmts=s16:channel_layouts=mono,volumedetect', '-c:a', 'pcm_s16le', '-f', 'hash', '-hash', 'sha256', '-'], { maxBuffer: 1024 ** 2, windowsHide: true });
  const mean = Number(/mean_volume:\s*(-?[\d.]+)/.exec(stderr)?.[1] ?? -100);
  const hash = /SHA256=([a-f0-9]+)/i.exec(stdout)?.[1];
  return mean > -55 && hash ? hash : null;
}
export async function normalizeClip(input, output, media, width, height, { assFile, noiseCancellation = false, layout, fit = 'cover' } = {}) {
  const args = ['-y', '-v', 'error', '-i', input];
  if (!media.video) args.push('-f', 'lavfi', '-i', `color=c=black:s=${width}x${height}:r=30`);
  if (!media.audio) args.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');
  if (noiseCancellation && media.audio) args.push('-af', 'afftdn=nr=12:nf=-40:tn=1');
  const crop = media.video && layout?.crop;
  const sizing = crop ? `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},scale=${width}:${height}` : fit === 'contain' ? `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2` : `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
  args.push('-map', media.video ? '0:v:0' : '1:v:0', '-map', media.audio ? '0:a:0' : '1:a:0', '-t', String(media.duration), '-vf', `${sizing},setsar=1,fps=30${assFile ? `,ass=filename=${path.basename(assFile)}` : ''}`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-video_track_timescale', '15360', output);
  await exec(process.env.FFMPEG_PATH || 'ffmpeg', args, { cwd: path.dirname(output), maxBuffer: 4 * 1024 ** 2 });
}
export async function renderCombination(files, output, scratch) {
  // Paths are generated IDs, never user filenames. Forward slashes work with FFmpeg on Windows too.
  await fs.writeFile(scratch, files.map(f => `file '${path.resolve(f).replaceAll('\\', '/').replaceAll("'", "'\\''")}'`).join('\n'));
  await exec(process.env.FFMPEG_PATH || 'ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', scratch, '-c', 'copy', '-movflags', '+faststart', output], { maxBuffer: 4 * 1024 ** 2 });
}
