import path from 'node:path';
import { config } from '../../config/env.js';
import { getAIProvider } from '../ai/index.js';
import { getContentService } from '../content/index.js';
import { createAccountStore } from './accountStore.js';
import { createAnalyticsStore } from './analyticsStore.js';
import { createAssetStore } from './assetStore.js';
import { createBatchStore } from './batchStore.js';
import { createContentAssetService } from './contentAssetService.js';
import { createDistributionService } from './distributionService.js';
import { createProviderRegistry } from './providerRegistry.js';
import { createPublicationStore } from './publicationStore.js';
import { DeepSeekResearchProvider } from './research.js';
import { createScheduler } from './scheduler.js';
import { createSecretBox } from './secretBox.js';

let shared = null;

/** The app-wide distribution service, built on first use — same lazy-singleton pattern as getContentService(). */
export function getDistributionService() {
  if (!shared) {
    const root = path.join(config.storageRoot, 'distribution');
    const secretBox = createSecretBox(config.distribution.secretKeyFile);
    const batches = createBatchStore(path.join(root, 'batches'));
    const assets = createAssetStore(path.join(root, 'assets'));
    const publications = createPublicationStore(path.join(root, 'publications'));
    const accounts = createAccountStore(path.join(root, 'accounts'), secretBox);
    const analytics = createAnalyticsStore(publications);
    const providers = createProviderRegistry(config.distribution);
    const contentAssets = createContentAssetService({ assets, batches, contentService: getContentService(), getProvider: getAIProvider });
    const scheduler = createScheduler({ publications, accounts, assets, providers, analytics, storageRoot: config.storageRoot });
    const research = new DeepSeekResearchProvider({ getProvider: getAIProvider });

    shared = createDistributionService({
      batches, assets, publications, accounts, analytics, providers, scheduler, contentAssets, research,
      storageRoot: config.storageRoot, maxUploadBytes: config.content.maxUploadBytes,
    });
  }
  return shared;
}
