import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  port: Number(process.env.PORT) || 5010,
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5180',
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27020/apollo_design',

  // Absolute path to the on-disk storage root.
  storageRoot: path.resolve(__dirname, '../../storage'),

  ai: {
    provider: process.env.AI_PROVIDER || 'deepseek',
    deepseek: {
      apiKey: process.env.DEEPSEEK_API_KEY || '',
      baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    },
  },

  images: {
    provider: process.env.IMAGE_PROVIDER || 'pexels',
    pexelsApiKey: process.env.PEXELS_API_KEY || '',
    unsplashAccessKey: process.env.UNSPLASH_ACCESS_KEY || '',
  },
};
