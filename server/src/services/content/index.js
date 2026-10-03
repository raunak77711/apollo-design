import path from 'node:path';
import { config } from '../../config/env.js';
import { getAIProvider } from '../ai/index.js';
import { getTranscriptionService } from '../transcription/transcriptionService.js';
import { createLlmCache } from './analysis/analyze.js';
import { createContentService } from './contentService.js';
import { createMediaClient } from './mediaClient.js';
import { createRenderClient } from './renderClient.js';
import { createSessionStore } from './sessionStore.js';

let shared = null;

/** The app-wide Content Factory service, built on first use. */
export function getContentService() {
  if (!shared) {
    shared = createContentService({
      store: createSessionStore(path.join(config.storageRoot, 'content', 'sessions')),
      transcription: getTranscriptionService(),
      getProvider: getAIProvider,
      llmCache: createLlmCache(path.join(config.storageRoot, 'content', 'llm-cache')),
      media: createMediaClient({ url: config.whisper.workerUrl || 'http://127.0.0.1:5011', storageRoot: config.storageRoot }),
      renderClient: createRenderClient({ url: config.content.renderWorkerUrl }),
      maxUploadBytes: config.content.maxUploadBytes,
    });
  }
  return shared;
}
