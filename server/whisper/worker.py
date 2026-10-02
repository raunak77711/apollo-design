"""
Apollo Content Factory - warm transcription worker.

The Apollo backend runs in Docker, but the GPU lives on the host. This is a tiny
HTTP service (standard library only) that runs on the host, keeps the Whisper
model loaded between jobs, and does one transcription at a time (a 4060 is
faster running jobs back to back than in parallel).

    GET  /health                -> { ok, device, model, cuda, ffmpeg, busy, queued }
    POST /jobs  { "path": ... } -> { id }           (path is relative to the storage root)
    GET  /jobs/<id>             -> { status: queued|running|done|failed, progress, result?, error? }

Only files under the storage root can be read (no path traversal), and the
service binds to 127.0.0.1 by default - Docker Desktop reaches it through
host.docker.internal.

    python worker.py --storage ../storage --port 5011
"""
from __future__ import annotations

import argparse
import json
import queue
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import transcribe as T

JOBS: dict[str, dict] = {}
QUEUE: "queue.Queue[str]" = queue.Queue()
STATE = {"busy": None}
LOCK = threading.Lock()
MAX_KEPT_JOBS = 50


def safe_resolve(storage: Path, rel: str) -> Path:
    target = (storage / rel).resolve()
    if storage.resolve() not in target.parents and target != storage.resolve():
        raise PermissionError("path is outside the storage root")
    return target


def run_job(job_id: str, storage: Path) -> None:
    job = JOBS[job_id]
    job["status"] = "running"
    job["startedAt"] = time.time()
    STATE["busy"] = job_id

    def progress(p: float) -> None:
        job["progress"] = round(p, 3)

    try:
        src = safe_resolve(storage, job["path"])
        job["result"] = T.transcribe(src, model=job["model"], device=job["device"], language=job["language"], on_progress=progress)
        job["status"] = "done"
        job["progress"] = 1.0
    except Exception as err:  # reported to the caller, never raised into the worker loop
        job["status"] = "failed"
        job["error"] = str(err)
    finally:
        job["finishedAt"] = time.time()
        STATE["busy"] = None


def worker_loop(storage: Path) -> None:
    while True:
        job_id = QUEUE.get()
        run_job(job_id, storage)
        with LOCK:  # keep memory bounded: a transcript is a few MB
            done = [k for k, v in JOBS.items() if v["status"] in ("done", "failed")]
            for k in done[:-MAX_KEPT_JOBS]:
                JOBS.pop(k, None)


def make_handler(storage: Path, defaults: dict):
    class Handler(BaseHTTPRequestHandler):
        server_version = "ApolloWhisper/1"

        def log_message(self, fmt, *args):  # quiet: one line per request is noise at 1 poll/second
            pass

        def _send(self, code: int, body: dict) -> None:
            data = json.dumps(body, ensure_ascii=False).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            if self.path == "/health":
                return self._send(200, {
                    "ok": True,
                    "cuda": T.cuda_available(),
                    "ffmpeg": bool(T.find_ffmpeg()),
                    "model": defaults["model"],
                    "busy": STATE["busy"],
                    "queued": QUEUE.qsize(),
                })
            if self.path.startswith("/jobs/"):
                job = JOBS.get(self.path.split("/", 2)[2])
                if not job:
                    return self._send(404, {"error": "unknown job"})
                body = {k: job[k] for k in ("status", "progress") }
                if job["status"] == "done":
                    body["result"] = job["result"]
                if job["status"] == "failed":
                    body["error"] = job["error"]
                return self._send(200, body)
            self._send(404, {"error": "not found"})

        def do_POST(self):
            if self.path != "/jobs":
                return self._send(404, {"error": "not found"})
            try:
                length = int(self.headers.get("Content-Length", "0"))
                req = json.loads(self.rfile.read(length) or b"{}")
                path = req["path"]
                src = safe_resolve(storage, path)
                if not src.is_file():
                    return self._send(404, {"error": f"file not found under storage root: {path}"})
            except PermissionError as err:
                return self._send(403, {"error": str(err)})
            except (KeyError, ValueError):
                return self._send(400, {"error": "body must be JSON with a 'path'"})
            job_id = uuid.uuid4().hex[:12]
            JOBS[job_id] = {
                "status": "queued", "progress": 0.0, "path": path,
                "model": req.get("model") or defaults["model"],
                "device": req.get("device") or defaults["device"],
                "language": req.get("language") or defaults["language"],
            }
            QUEUE.put(job_id)
            self._send(202, {"id": job_id})

    return Handler


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--storage", default=str(T.HERE.parent / "storage"), help="root the worker may read from")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=5011)
    ap.add_argument("--model", default=T.DEFAULT_MODEL)
    ap.add_argument("--device", default="auto", choices=["auto", "cuda", "cpu"])
    ap.add_argument("--language", default=T.DEFAULT_LANGUAGE)
    args = ap.parse_args()

    storage = Path(args.storage).resolve()
    storage.mkdir(parents=True, exist_ok=True)
    defaults = {"model": args.model, "device": args.device, "language": args.language}

    # Load the model now so the first real job does not pay for it.
    dev, compute = T.resolve_device(args.device)
    print(f"[whisper-worker] loading {args.model} on {dev} ({compute}) ...", flush=True)
    t0 = time.time()
    T.load_model(args.model, dev, compute)
    print(f"[whisper-worker] model ready in {time.time() - t0:.1f}s; storage root {storage}", flush=True)

    threading.Thread(target=worker_loop, args=(storage,), daemon=True).start()
    server = ThreadingHTTPServer((args.host, args.port), make_handler(storage, defaults))
    print(f"[whisper-worker] listening on http://{args.host}:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
