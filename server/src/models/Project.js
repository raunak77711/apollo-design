import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, default: 'Untitled Design' },
    type: { type: String, default: 'design' }, // 'design' | 'webapp' (future)
    // The canonical Apollo design document lives here for the MVP. Previews are
    // rendered from it directly, so no thumbnail is stored.
    document: { type: mongoose.Schema.Types.Mixed, required: true },
    // Saved versions, oldest first. A version is a full snapshot rather than a
    // diff: they are few, a design document is small, and being able to hand
    // one straight back to the editor is worth more than the bytes. Kept
    // `Mixed` for the same reason `document` is — the shape is owned by
    // `services/versionService.js`, not by Mongoose.
    versions: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { timestamps: true }
);

// The dashboard always lists projects newest-first.
projectSchema.index({ updatedAt: -1 });

export const Project = mongoose.model('Project', projectSchema);
