#!/usr/bin/env node
/**
 * Start the warm Whisper worker on this machine (it needs the GPU, so it runs on the
 * host even when the backend itself runs in Docker).
 *
 *   npm run whisper:worker --prefix server
 *
 * Environment: WHISPER_PORT (default 5011), WHISPER_MODEL, WHISPER_DEVICE (auto|cuda|cpu), WHISPER_LANGUAGE.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../src/config/env.js';
import { defaultPython } from '../src/services/transcription/whisperRunner.js';

const python = config.whisper.python || defaultPython();
if (!python) {
  console.error('No Whisper Python environment found. Run:  powershell -ExecutionPolicy Bypass -File server/whisper/setup.ps1');
  process.exit(1);
}

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../whisper/worker.py');
const child = spawn(python, [
  script,
  '--storage', config.storageRoot,
  '--port', process.env.WHISPER_PORT || '5011',
  '--model', config.whisper.model,
  '--device', config.whisper.device,
  '--language', config.whisper.language,
], { stdio: 'inherit', env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' } });

child.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill());
