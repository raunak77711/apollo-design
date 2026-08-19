import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load the server's own .env first, then the repo-root one. Docker passes the
// root file in as env_file, but `npm run dev --prefix server` runs with the
// server directory as its cwd, where dotenv would otherwise find nothing — and
// a silently keyless server falls back to mock AI and placeholder photos.
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

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

  // Gemini — captions an attached reference image for the DeepSeek brief
  // prompt (`describeReference`). Its own `generateImage` is not wired into
  // the pipeline; imagery comes from the stock-photo curator. Optional.
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    imageModel: process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image',
    visionModel: process.env.GEMINI_VISION_MODEL || 'gemini-flash-latest',
    baseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',
  },
};
