import { nanoid } from 'nanoid';
import { isMongoConnected } from '../config/db.js';
import { Project } from '../models/Project.js';
import { Asset } from '../models/Asset.js';

/**
 * Repository layer. Uses Mongoose when MongoDB is connected, otherwise an
 * in-memory Map so the MVP runs with zero infrastructure. Both branches return
 * plain objects with a string `id` field to keep controllers backend-agnostic.
 */

const mem = {
  projects: new Map(),
  assets: new Map(),
};

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
