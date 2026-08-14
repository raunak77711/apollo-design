import { Router } from 'express';
import { projects } from '../store/index.js';
import { createEmptyDocument, validateDocument } from '../design/schema.js';

export const projectsRouter = Router();

// Cap on the elements sent with each list entry — enough for an accurate card
// preview without shipping whole documents to the dashboard.
const PREVIEW_ELEMENTS = 80;

projectsRouter.get('/', async (req, res) => {
  const list = await projects.list();
  res.json(
    list.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      updatedAt: p.updatedAt,
      createdAt: p.createdAt,
      // The client renders live previews from the document itself, so project
      // cards can never show a stale thumbnail.
      preview: p.document
        ? { canvas: p.document.canvas, elements: (p.document.elements || []).slice(0, PREVIEW_ELEMENTS) }
        : null,
    }))
  );
});

projectsRouter.post('/', async (req, res) => {
  const { name, type = 'design', canvas, document } = req.body || {};
  // A document may be supplied (starting from a template); otherwise an empty
  // canvas of the requested size is created.
  if (document !== undefined && !validateDocument(document)) {
    return res.status(400).json({ error: 'Invalid design document' });
  }
  const project = await projects.create({
    name: name || 'Untitled design',
    type,
    document: document || createEmptyDocument(canvas || {}),
  });
  res.status(201).json(project);
});

projectsRouter.get('/:id', async (req, res) => {
  const project = await projects.get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project);
});

projectsRouter.put('/:id', async (req, res) => {
  const { name, document } = req.body || {};
  const changes = {};
  if (name !== undefined) changes.name = name;
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
