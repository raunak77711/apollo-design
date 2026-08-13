import { Router } from 'express';
import { projects } from '../store/index.js';
import { createEmptyDocument, validateDocument } from '../design/schema.js';

export const projectsRouter = Router();

projectsRouter.get('/', async (req, res) => {
  const list = await projects.list();
  res.json(list.map((p) => ({ id: p.id, name: p.name, type: p.type, thumbnail: p.thumbnail, updatedAt: p.updatedAt, createdAt: p.createdAt })));
});

projectsRouter.post('/', async (req, res) => {
  const { name, type = 'design', canvas } = req.body || {};
  const document = createEmptyDocument(canvas || {});
  const project = await projects.create({
    name: name || 'Untitled Design',
    type,
    document,
  });
  res.status(201).json(project);
});

projectsRouter.get('/:id', async (req, res) => {
  const project = await projects.get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project);
});

projectsRouter.put('/:id', async (req, res) => {
  const { name, document, thumbnail } = req.body || {};
  const changes = {};
  if (name !== undefined) changes.name = name;
  if (thumbnail !== undefined) changes.thumbnail = thumbnail;
  if (document !== undefined) {
    if (!validateDocument(document)) return res.status(400).json({ error: 'Invalid design document' });
    changes.document = document;
  }
  const updated = await projects.update(req.params.id, changes);
  if (!updated) return res.status(404).json({ error: 'Project not found' });
  res.json(updated);
});

projectsRouter.delete('/:id', async (req, res) => {
  const ok = await projects.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Project not found' });
  res.status(204).end();
});
