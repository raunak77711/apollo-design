import fs from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { config } from '../config/env.js';

/**
 * Local filesystem storage. All paths are confined under storageRoot; we never
 * trust user-provided filenames — safe unique names are always generated.
 */

const SAFE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);

export function projectDir(projectId, sub) {
  const safeId = String(projectId).replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(config.storageRoot, 'projects', safeId, sub);
}

export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

export function safeFilename(originalName = '', fallbackExt = '.png') {
  const ext = SAFE_EXT.has(path.extname(originalName).toLowerCase())
    ? path.extname(originalName).toLowerCase()
    : fallbackExt;
  return `${nanoid()}${ext}`;
}

/** Resolve a stored relative path to an absolute one, rejecting traversal. */
export function resolveStoragePath(relPath) {
  const abs = path.resolve(config.storageRoot, relPath);
  if (!abs.startsWith(config.storageRoot)) {
    throw new Error('Path traversal blocked');
  }
  return abs;
}

export async function saveBuffer(projectId, sub, filename, buffer) {
  const dir = projectDir(projectId, sub);
  await ensureDir(dir);
  const abs = path.join(dir, filename);
  await fs.writeFile(abs, buffer);
  const rel = path.relative(config.storageRoot, abs).split(path.sep).join('/');
  return { absolutePath: abs, relativePath: rel, url: `/storage/${rel}` };
}
