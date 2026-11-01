/**
 * Where a short will be watched, and what that asks of the file.
 *
 * MIRRORED byte-for-byte at client/src/video/platforms.js (the same practice as the board schema): the
 * server validates against it, the live preview draws its safe zones from it, and the renderer reads it,
 * so the three cannot disagree. server/test/content.parity.test.js fails if the copies drift.
 *
 * The OUTPUT block is the one format every platform accepts: 1080x1920 (9:16), H.264 High profile,
 * 4:2:0 8-bit, 30 fps, AAC stereo 48 kHz, MP4 with the index at the front (faststart) so it starts
 * playing before it has finished uploading. Rendered once, posted anywhere.
 *
 * SAFE zones are the margins (in pixels of the 1080x1920 frame) each app covers with its own interface:
 * the account name and caption at the bottom, the like/share rail on the right, the search bar at the top.
 * Anything important (captions, a face, a diagram) stays inside the "universal" rectangle, which is the
 * strictest of them all.
 */

export const OUTPUT = {
  width: 1080,
  height: 1920,
  fps: 30,
  container: 'mp4',
  videoCodec: 'h264',
  profile: 'high',
  pixelFormat: 'yuv420p',
  crf: 18,
  audioCodec: 'aac',
  audioBitrate: '192k',
  sampleRate: 48000,
  faststart: true,
};

export const PLATFORMS = {
  universal: {
    label: 'Every platform',
    maxSeconds: 60,
    sweetSpot: [20, 60],
    maxMegabytes: 250,
    safe: { top: 250, bottom: 480, left: 60, right: 140 },
  },
  tiktok: {
    label: 'TikTok',
    maxSeconds: 600,
    sweetSpot: [20, 60],
    maxMegabytes: 287,
    safe: { top: 150, bottom: 450, left: 60, right: 140 },
  },
  youtube_shorts: {
    label: 'YouTube Shorts',
    maxSeconds: 180,
    sweetSpot: [20, 58],
    maxMegabytes: 500,
    safe: { top: 200, bottom: 480, left: 60, right: 120 },
  },
  instagram_reels: {
    label: 'Instagram Reels',
    maxSeconds: 180,
    sweetSpot: [15, 60],
    maxMegabytes: 250,
    safe: { top: 250, bottom: 420, left: 60, right: 140 },
  },
};

export const PLATFORM_IDS = Object.keys(PLATFORMS);

/** The rectangle everything important must stay inside for a platform. */
export function safeRect(platform = 'universal') {
  const p = PLATFORMS[platform] || PLATFORMS.universal;
  return { x: p.safe.left, y: p.safe.top, w: OUTPUT.width - p.safe.left - p.safe.right, h: OUTPUT.height - p.safe.top - p.safe.bottom };
}

/** Plain-language notes about how a short's length sits with a platform. Empty when nothing is worth saying. */
export function lengthWarnings(seconds, platform = 'universal') {
  const p = PLATFORMS[platform] || PLATFORMS.universal;
  const notes = [];
  if (seconds > p.maxSeconds) notes.push(`${p.label} allows up to ${p.maxSeconds}s; this short is ${Math.round(seconds)}s.`);
  else if (seconds > p.sweetSpot[1] + 15) notes.push(`This short is ${Math.round(seconds)}s. Shorts tend to hold viewers best at ${p.sweetSpot[0]}-${p.sweetSpot[1]}s.`);
  if (seconds < p.sweetSpot[0] - 8) notes.push(`This short is only ${Math.round(seconds)}s: very short clips struggle to land a payoff.`);
  return notes;
}
