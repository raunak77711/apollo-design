import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, default: 'Untitled Design' },
    type: { type: String, default: 'design' }, // 'design' | 'webapp' (future)
    thumbnail: { type: String, default: '' },
    // The canonical Apollo design document lives here for the MVP.
    document: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

export const Project = mongoose.model('Project', projectSchema);
