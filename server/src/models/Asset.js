import mongoose from 'mongoose';

const assetSchema = new mongoose.Schema(
  {
    projectId: { type: String, index: true },
    type: { type: String, default: 'image' }, // 'image' | 'export'
    provider: { type: String, default: 'local' }, // 'local' | 'pexels' | 'unsplash'
    providerId: { type: String, default: '' },
    filename: { type: String, default: '' },
    path: { type: String, default: '' }, // relative path under storage/
    url: { type: String, default: '' }, // public URL served by Express
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export const Asset = mongoose.model('Asset', assetSchema);
