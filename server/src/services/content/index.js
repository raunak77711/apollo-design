import path from 'node:path';
import { config } from '../../config/env.js';
import { getTranscriptionService } from '../transcription/transcriptionService.js';
import { createContentService } from './contentService.js';
import { createSessionStore } from './sessionStore.js';

let shared = null;

/** The app-wide Content Factory service, built on first use. */
export function getContentService() {
  if (!shared) {
    shared = createContentService({
      store: createSessionStore(path.join(config.storageRoot, 'content', 'sessions')),
      transcription: getTranscriptionService(),
      maxUploadBytes: config.content.maxUploadBytes,
    });
  }
  return shared;
}
