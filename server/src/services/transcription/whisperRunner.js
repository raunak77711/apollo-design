import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * How Apollo reaches Whisper. A runner is { mode, health(), transcribe({ absPath, onProgress }) }.
 *
 *  - worker: the warm HTTP worker (whisper/worker.py) on the host. This is what the Dockerised
 *    backend uses: the GPU and the model live on the host, the backend only sends a path
 *    under the shared storage folder and polls for the result.
 *  - spawn: run whisper/transcribe.py directly. For a backend running on the host (npm run dev)
 *    and for the command line; it pays the model-load cost on every call.
 *
 * Neither is required to exist: with no worker URL and no Python environment,
 * `resolveRunner` returns null and the Content Factory reports transcription as unavailable.
 */

const WHISPER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../whisper');

export class TranscriptionUnavailableError extends Error {}
export class TranscriptionFailedError extends Error {}

export function defaultPython() {
  const win = path.join(WHISPER_DIR, '.venv', 'Scripts', 'python.exe');
  const nix = path.join(WHISPER_DIR, '.venv', 'bin', 'python');
  return fs.existsSync(win) ? win : fs.existsSync(nix) ? nix : '';
}

/* ---------------------------------- spawn ---------------------------------- */

export function createSpawnRunner({ python, model, device = 'auto', language = 'en', script = path.join(WHISPER_DIR, 'transcribe.py') }) {
  return {
    mode: 'spawn',

    async health() {
      const ok = fs.existsSync(python) && fs.existsSync(script);
      return { ok, mode: 'spawn', python, ...(ok ? {} : { reason: 'Python environment not found. Run server/whisper/setup.ps1' }) };
    },

    async transcribe({ absPath, onProgress }) {
      const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'apollo-whisper-'));
      const out = path.join(dir, 'transcript.json');
      const args = [script, absPath, '--out', out, '--model', model, '--device', device, '--language', language];
      try {
        const { code, errorLine } = await new Promise((resolve, reject) => {
          const child = spawn(python, args, { env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' }, windowsHide: true });
          let errorLine = '';
          let buffer = '';
          child.stderr.on('data', (chunk) => {
            buffer += chunk.toString('utf8');
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop();
            for (const line of lines) {
              if (line.startsWith('PROGRESS ')) onProgress?.(Number(line.slice(9)));
              else if (line.startsWith('ERROR ')) errorLine = line.slice(6);
            }
          });
          child.on('error', reject);
          child.on('close', (code) => resolve({ code, errorLine }));
        });
        if (code !== 0) throw new TranscriptionFailedError(errorLine || `transcription process exited with code ${code}`);
        return JSON.parse(await fsp.readFile(out, 'utf8'));
      } finally {
        await fsp.rm(dir, { recursive: true, force: true });
      }
    },
  };
}

/* ---------------------------------- worker --------------------------------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createWorkerRunner({ url, storageRoot, model, device, language, fetchImpl = fetch, pollMs = 1000, maxPollFailures = 30 }) {
  const base = url.replace(/\/+$/, '');

  async function call(route, init) {
    const res = await fetchImpl(`${base}${route}`, { ...init, signal: AbortSignal.timeout(15_000) });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  }

  return {
    mode: 'worker',

    async health() {
      try {
        const { ok, body } = await call('/health');
        return ok ? { ...body, mode: 'worker', url: base } : { ok: false, mode: 'worker', url: base, reason: 'worker returned an error' };
      } catch (err) {
        return { ok: false, mode: 'worker', url: base, reason: `worker not reachable (${err.message}). Start it: npm run whisper:worker --prefix server` };
      }
    },

    async transcribe({ absPath, onProgress }) {
      const rel = path.relative(storageRoot, absPath);
      if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new TranscriptionUnavailableError('The video must be stored under Apollo\'s storage folder for the Whisper worker to read it.');
      }
      let created;
      try {
        created = await call('/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: rel.split(path.sep).join('/'), model, device, language }),
        });
      } catch (err) {
        throw new TranscriptionUnavailableError(`Whisper worker not reachable at ${base} (${err.message}). Start it: npm run whisper:worker --prefix server`);
      }
      if (!created.ok) throw new TranscriptionFailedError(created.body.error || `worker rejected the job (${created.status})`);

      const id = created.body.id;
      let failures = 0;
      for (;;) {
        await sleep(pollMs);
        let polled;
        try {
          polled = await call(`/jobs/${id}`);
          failures = 0;
        } catch (err) {
          // A long job should survive a hiccup (worker busy, network blip), but not a dead worker.
          if (++failures >= maxPollFailures) throw new TranscriptionUnavailableError(`lost contact with the Whisper worker (${err.message})`);
          continue;
        }
        if (!polled.ok) throw new TranscriptionFailedError(polled.body.error || 'worker lost the job');
        const job = polled.body;
        if (typeof job.progress === 'number') onProgress?.(job.progress);
        if (job.status === 'done') return job.result;
        if (job.status === 'failed') throw new TranscriptionFailedError(job.error || 'transcription failed');
      }
    },
  };
}

/** Pick a runner from config: a worker if one is configured, else the local Python environment, else none. */
export function resolveRunner({ whisper, storageRoot }) {
  const shared = { model: whisper.model, device: whisper.device, language: whisper.language };
  if (whisper.workerUrl) return createWorkerRunner({ url: whisper.workerUrl, storageRoot, ...shared });
  const python = whisper.python || defaultPython();
  if (python) return createSpawnRunner({ python, ...shared });
  return null;
}
