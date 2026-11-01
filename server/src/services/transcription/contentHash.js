import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

/**
 * SHA-256 of a file's bytes, streamed. The transcript cache is keyed by this, so
 * the same recording is recognised whatever it is called or wherever it lives.
 * Streaming keeps memory flat for a multi-gigabyte phone video.
 */
export function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(filePath, { highWaterMark: 4 * 1024 * 1024 })
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });
}
