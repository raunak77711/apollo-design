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

  // Content Factory - local transcription. Whisper runs on the host (it needs the GPU);
  // from Docker the backend reaches it through WHISPER_WORKER_URL. With neither a worker
  // URL nor a local venv, transcription reports "unavailable" and the rest of Apollo is unaffected.
  whisper: {
    workerUrl: process.env.WHISPER_WORKER_URL || '',
    python: process.env.WHISPER_PYTHON || '',
    model: process.env.WHISPER_MODEL || 'large-v3-turbo',
    language: process.env.WHISPER_LANGUAGE || 'en',
    device: process.env.WHISPER_DEVICE || 'auto',
  },
  transcriptsDir: path.resolve(__dirname, '../../storage/transcripts'),

  // Content Factory sessions (long-form recordings and what is derived from them).
  content: {
    maxUploadBytes: (Number(process.env.CONTENT_MAX_UPLOAD_GB) || 20) * 1024 ** 3,
    // The render worker (Remotion + FFmpeg) runs on the host beside the GPU, like the Whisper worker.
    renderWorkerUrl: process.env.RENDER_WORKER_URL || 'http://127.0.0.1:5012',
  },

  // Distribution: real publishing to YouTube, a Facebook Page (and, through it, Instagram)
  // and TikTok, plus the scheduler and analytics ingestion that run while Apollo is online.
  // Every secret below is OPTIONAL and per-platform: a platform with no client id/secret
  // configured simply can't be connected yet (see README's Distribution section for the
  // developer-app setup each one needs — Apollo cannot create these apps for you).
  distribution: {
    secretKeyFile: path.resolve(__dirname, '../../storage/distribution/.secret-key'),
    // Where a rendered short can be fetched from the public internet. Only Instagram's publish
    // API needs this (it fetches the video by URL); everything else uploads the bytes directly.
    publicMediaBaseUrl: process.env.PUBLIC_MEDIA_BASE_URL || '',
    tickIntervalMs: (Number(process.env.DISTRIBUTION_TICK_MINUTES) || 15) * 60_000,
    youtube: { clientId: process.env.YOUTUBE_CLIENT_ID || '', clientSecret: process.env.YOUTUBE_CLIENT_SECRET || '' },
    facebook: { clientId: process.env.FACEBOOK_CLIENT_ID || '', clientSecret: process.env.FACEBOOK_CLIENT_SECRET || '' },
    tiktok: { clientKey: process.env.TIKTOK_CLIENT_KEY || '', clientSecret: process.env.TIKTOK_CLIENT_SECRET || '' },
  },

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
  // prompt (`describeReference`), and reads a scribble into located regions.
  // Its `generateImage` is the *backup* route for rendering a drawing (the
  // primary one reaches the same model through OpenRouter, below, because
  // this key's own image quota is the first thing to run out). Optional.
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    imageModel: process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image',
    visionModel: process.env.GEMINI_VISION_MODEL || 'gemini-flash-latest',
    baseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',
  },

  // OpenRouter — bespoke background art for scribble-originated designs (and,
  // from the edit path, "make the background X"-style requests). Klein 4B is
  // FLUX.2's fast/cheap tier, priced per megapixel rather than per second like
  // a video model, which is what this pipeline actually wants. `visionModel`
  // is the fallback scribble reader used when Gemini is unconfigured or
  // rejects the call (its free tier is 20 requests/day and exhausts fast) —
  // confirmed live against OpenRouter's own chat/completions endpoint.
  // Optional: with no key, every caller falls straight through to its
  // non-bespoke path (stock photography, geometry-only scribble reading).
  // `imageEditModel` is the one that can be shown a drawing. FLUX takes a
  // prompt and nothing else, so a scribble could never reach it — which is
  // exactly why scribble-driven art used to come back unrelated to the
  // sketch. Nano banana accepts the drawing itself through chat/completions,
  // and reaching it on the OpenRouter key sidesteps Gemini's own image quota.
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY || '',
    imageModel: process.env.OPENROUTER_IMAGE_MODEL || 'black-forest-labs/flux.2-klein-4b',
    imageEditModel: process.env.OPENROUTER_IMAGE_EDIT_MODEL || 'google/gemini-2.5-flash-image',
    visionModel: process.env.OPENROUTER_VISION_MODEL || 'google/gemini-2.5-flash-lite',
    baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
  },
};
