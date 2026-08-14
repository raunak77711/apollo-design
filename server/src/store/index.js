import { nanoid } from 'nanoid';
import { isMongoConnected } from '../config/db.js';
import { Project } from '../models/Project.js';
import { Asset } from '../models/Asset.js';
import { ImageSearchCache } from '../models/ImageSearchCache.js';

/**
 * Repository layer. Uses Mongoose when MongoDB is connected, otherwise an
 * in-memory Map so the MVP runs with zero infrastructure. Both branches return
 * plain objects with a string `id` field to keep controllers backend-agnostic.
 */

const mem = {
  projects: new Map(),
  assets: new Map(),
  imageCache: new Map(),
};

const IMAGE_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days, matches the Mongo TTL index

function toPlain(doc) {
  if (!doc) return null;
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  obj.id = String(obj._id ?? obj.id);
  delete obj._id;
  delete obj.__v;
  return obj;
}

/* ----------------------------- Projects ----------------------------- */

export const projects = {
  async list() {
    if (isMongoConnected()) {
      const docs = await Project.find().sort({ updatedAt: -1 }).lean();
      return docs.map(toPlain);
    }
    return [...mem.projects.values()].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  },

  async get(id) {
    if (isMongoConnected()) {
      try {
        return toPlain(await Project.findById(id).lean());
      } catch {
        return null;
      }
    }
    return mem.projects.get(id) || null;
  },

  async create(data) {
    if (isMongoConnected()) {
      const doc = await Project.create(data);
      return toPlain(doc);
    }
    const now = new Date().toISOString();
    const project = { id: nanoid(), createdAt: now, updatedAt: now, ...data };
    mem.projects.set(project.id, project);
    return project;
  },

  async update(id, changes) {
    if (isMongoConnected()) {
      try {
        const doc = await Project.findByIdAndUpdate(id, changes, { new: true }).lean();
        return toPlain(doc);
      } catch {
        return null;
      }
    }
    const existing = mem.projects.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...changes, updatedAt: new Date().toISOString() };
    mem.projects.set(id, updated);
    return updated;
  },

  async remove(id) {
    if (isMongoConnected()) {
      try {
        await Project.findByIdAndDelete(id);
        return true;
      } catch {
        return false;
      }
    }
    return mem.projects.delete(id);
  },
};

/* ------------------------------ Assets ------------------------------ */

export const assets = {
  async list({ limit = 200 } = {}) {
    if (isMongoConnected()) {
      const docs = await Asset.find({ type: 'image' }).sort({ createdAt: -1 }).limit(limit).lean();
      return docs.map(toPlain);
    }
    return [...mem.assets.values()]
      .filter((a) => a.type === 'image')
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);
  },

  async get(id) {
    if (isMongoConnected()) {
      try {
        return toPlain(await Asset.findById(id).lean());
      } catch {
        return null;
      }
    }
    return mem.assets.get(id) || null;
  },

  async create(data) {
    if (isMongoConnected()) {
      const doc = await Asset.create(data);
      return toPlain(doc);
    }
    const now = new Date().toISOString();
    const asset = { id: nanoid(), createdAt: now, updatedAt: now, ...data };
    mem.assets.set(asset.id, asset);
    return asset;
  },
};

/* -------------------------- Image search cache ------------------------ */

export const imageCache = {
  async get(key) {
    if (isMongoConnected()) {
      const doc = await ImageSearchCache.findOne({ key }).lean();
      return doc?.results || null;
    }
    const entry = mem.imageCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.at > IMAGE_CACHE_TTL_MS) {
      mem.imageCache.delete(key);
      return null;
    }
    return entry.results;
  },

  async set(key, { provider, query, results }) {
    if (isMongoConnected()) {
      await ImageSearchCache.findOneAndUpdate(
        { key },
        { key, provider, query, results, createdAt: new Date() },
        { upsert: true }
      );
      return;
    }
    mem.imageCache.set(key, { results, at: Date.now() });
  },
};
