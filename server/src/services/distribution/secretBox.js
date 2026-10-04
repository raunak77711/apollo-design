import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * At-rest encryption for platform credentials (OAuth tokens).
 *
 * Apollo has no login — anyone with filesystem access to `storage/` already has
 * everything — but a YouTube/TikTok/Meta refresh token is a credential for someone
 * else's system, and `session.json`-style files are the kind of thing that ends up
 * in a screen share or a support zip without a second thought. So tokens are never
 * written to disk in the clear: AES-256-GCM with a key kept in one local file that
 * is gitignored and excluded from Docker images, generated on first use.
 */

export function createSecretBox(keyFile) {
  fs.mkdirSync(path.dirname(keyFile), { recursive: true });
  let raw;
  try {
    raw = fs.readFileSync(keyFile);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    raw = randomBytes(32);
    fs.writeFileSync(keyFile, raw, { mode: 0o600 });
  }
  const key = raw.length === 32 ? raw : scryptSync(raw, 'apollo-distribution', 32);

  return {
    /** string -> opaque string, safe to store in JSON. */
    seal(plaintext) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
    },
    /** the reverse of seal(); throws if the box was tampered with or the key changed. */
    open(sealed) {
      const buf = Buffer.from(sealed, 'base64');
      const iv = buf.subarray(0, 12);
      const tag = buf.subarray(12, 28);
      const enc = buf.subarray(28);
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
    },
  };
}
