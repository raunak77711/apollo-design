import { config } from '../../config/env.js';
import { DeepSeekProvider } from './DeepSeekProvider.js';
import { MockProvider } from './MockProvider.js';

let provider = null;

/** Lazily select the AI provider based on configuration/available keys. */
export function getAIProvider() {
  if (provider) return provider;

  if (config.ai.provider === 'deepseek' && config.ai.deepseek.apiKey) {
    provider = new DeepSeekProvider(config.ai.deepseek);
    console.log('[ai] Using DeepSeekProvider');
  } else {
    provider = new MockProvider();
    console.log('[ai] No DEEPSEEK_API_KEY set — using deterministic MockProvider');
  }
  return provider;
}
