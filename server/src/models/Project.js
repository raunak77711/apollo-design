import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, default: 'Untitled Design' },
    type: { type: String, default: 'design' }, // 'design' | 'webapp' (future)
    // The canonical Apollo design document lives here for the MVP. Previews are
    // rendered from it directly, so no thumbnail is stored.
    document: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

// The dashboard always lists projects newest-first.
projectSchema.index({ updatedAt: -1 });

export const Project = mongoose.model('Project', projectSchema);
