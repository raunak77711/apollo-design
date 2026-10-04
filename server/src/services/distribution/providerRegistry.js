import { FacebookProvider } from './providers/FacebookProvider.js';
import { InstagramProvider } from './providers/InstagramProvider.js';
import { PLATFORM_IDS } from './providers/PlatformProvider.js';
import { TikTokProvider } from './providers/TikTokProvider.js';
import { YouTubeProvider } from './providers/YouTubeProvider.js';

/** One PlatformProvider per platform, built from config. A platform with no client id/secret configured simply isn't connectable yet. */
export function createProviderRegistry(config, { fetchImpl = fetch } = {}) {
  const providers = {
    youtube: new YouTubeProvider({ clientId: config.youtube?.clientId, clientSecret: config.youtube?.clientSecret, fetchImpl }),
    facebook: new FacebookProvider({ clientId: config.facebook?.clientId, clientSecret: config.facebook?.clientSecret, fetchImpl }),
    instagram: new InstagramProvider({ publicMediaBaseUrl: config.publicMediaBaseUrl, fetchImpl }),
    tiktok: new TikTokProvider({ clientKey: config.tiktok?.clientKey, clientSecret: config.tiktok?.clientSecret, fetchImpl }),
  };

  return {
    ids: PLATFORM_IDS,
    get(platform) {
      const p = providers[platform];
      if (!p) throw new Error(`unknown platform: ${platform}`);
      return p;
    },
    /** Is this platform even configured with developer credentials yet? (Separate from whether an account is connected.) */
    isConfigured(platform) {
      if (platform === 'youtube') return Boolean(config.youtube?.clientId && config.youtube?.clientSecret);
      if (platform === 'facebook') return Boolean(config.facebook?.clientId && config.facebook?.clientSecret);
      if (platform === 'instagram') return Boolean(config.facebook?.clientId && config.facebook?.clientSecret); // rides on the Facebook app
      if (platform === 'tiktok') return Boolean(config.tiktok?.clientKey && config.tiktok?.clientSecret);
      return false;
    },
  };
}
