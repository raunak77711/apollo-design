import mongoose from 'mongoose';
import { config } from './env.js';

let connected = false;

/**
 * Attempt to connect to MongoDB. If it fails (e.g. Mongo not running locally),
 * we don't crash — the app falls back to an in-memory store so the MVP still
 * runs out of the box. See ../store/index.js.
 */
export async function connectDatabase() {
  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 3000 });
    connected = true;
    console.log('[db] Connected to MongoDB');
  } catch (err) {
    connected = false;
    console.warn(
      `[db] MongoDB unavailable (${err.message}). Falling back to in-memory store. ` +
        'Data will NOT persist across restarts.'
    );
  }
  return connected;
}

export function isMongoConnected() {
  return connected && mongoose.connection.readyState === 1;
}
