import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/**
 * Receive a long-form recording as a raw request body and put it on disk.
 *
 * Streamed, never buffered: a 40-minute phone video is gigabytes. The SHA-256 is
 * computed while the bytes are written, so the transcript cache key is known the
 * moment the upload ends without reading the file a second time. The file is
 * stored under its own hash (`source-<hash12>.<ext>`), which makes the URL
 * content-addressed, so the long browser cache on /storage can never serve a
 * replaced video.
 */

export const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi', '.mp3', '.wav', '.m4a']);

export class UploadError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function extensionOf(fileName) {
  const ext = path.extname(String(fileName || '')).toLowerCase();
  if (!VIDEO_EXTENSIONS.has(ext)) {
    throw new UploadError(400, `That file type isn't supported. Use ${[...VIDEO_EXTENSIONS].filter((e) => e !== '.mp3' && e !== '.wav' && e !== '.m4a').join(', ')} (or audio: .mp3, .wav, .m4a).`);
  }
  return ext;
}

/**
 * Stream `source` (a request, or any readable) into `dir`. Resolves
 * { storedName, bytes, sha256 }; on any failure (client gone, too big) leaves nothing behind.
 */
export async function storeUpload(source, { dir, ext, maxBytes }) {
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `upload-${process.pid}-${Date.now()}.tmp`);
  const hash = createHash('sha256');
  let bytes = 0;

  const meter = new Transform({
    transform(chunk, _enc, done) {
      bytes += chunk.length;
      if (bytes > maxBytes) return done(new UploadError(413, `That file is larger than the ${Math.round(maxBytes / 1024 ** 3)} GB limit.`));
      hash.update(chunk);
      return done(null, chunk);
    },
  });

  try {
    await pipeline(source, meter, createWriteStream(tmp));
    if (bytes === 0) throw new UploadError(400, 'That upload was empty.');
    const sha256 = hash.digest('hex');
    const storedName = `source-${sha256.slice(0, 12)}${ext}`;
    await fs.rename(tmp, path.join(dir, storedName));
    return { storedName, bytes, sha256 };
  } catch (err) {
    await fs.rm(tmp, { force: true });
    throw err;
  }
}
