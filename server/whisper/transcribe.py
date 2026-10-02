"""
Apollo Content Factory - local transcription with faster-whisper.

One job: video (or audio) file in, transcript with WORD-LEVEL timestamps out.

    python transcribe.py path/to/video.mp4 --out transcript.json

The same `transcribe()` function is used by worker.py (the warm HTTP worker the
Apollo backend talks to), so there is exactly one implementation of "how Apollo
turns speech into words".

Design notes
  * Verbatim, not polished. Whisper loves to tidy "I I I think" into "I think".
    Apollo needs the mess (stutters, false starts, "sorry", "let me say that
    again") because that is how retakes are found, so the prompt below nudges
    the model to keep disfluencies, and previous-text conditioning is off so a
    bad take cannot bleed into the next sentence.
  * GPU first, CPU if CUDA is not usable. A CUDA failure can surface late (a
    missing cuDNN DLL only shows up at the first decode), so the fallback wraps
    the whole run, not just model loading.
  * FFmpeg is used for audio extraction when present (16 kHz mono PCM, which is
    all Whisper reads anyway). When it is not, PyAV, which ships inside the
    faster-whisper install, decodes the container directly.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Callable, Optional

os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

HERE = Path(__file__).resolve().parent
MODEL_DIR = HERE / "models"

# large-v3-turbo: large-v3 accuracy with a 4-layer decoder. ~1.6 GB in float16, so it
# fits an 8 GB card with room to spare (the desktop itself holds ~1.4 GB), and it runs
# many times faster than real time.
DEFAULT_MODEL = os.environ.get("WHISPER_MODEL", "large-v3-turbo")
DEFAULT_LANGUAGE = os.environ.get("WHISPER_LANGUAGE", "en")

# A few filler words and a restart in the prompt are enough to keep Whisper from
# cleaning them away.
VERBATIM_PROMPT = (
    "Umm, let me think. Uh, so, you know, it's like... I mean, I-I think, sorry, "
    "let me say that again. Okay."
)

ProgressFn = Callable[[float], None]


class TranscriptionError(RuntimeError):
    pass


# --------------------------------------------------------------------------- #
# CUDA runtime discovery
# --------------------------------------------------------------------------- #
def add_cuda_runtime_paths() -> list[str]:
    """
    ctranslate2 needs cuBLAS and cuDNN 9. Rather than a system-wide CUDA install,
    Apollo gets them from the nvidia-* pip wheels inside this venv; this puts their
    DLL/.so folders where the loader will look. Returns the folders it added.
    """
    added: list[str] = []
    for entry in sys.path:
        nvidia = Path(entry) / "nvidia"
        if not nvidia.is_dir():
            continue
        for sub in sorted(nvidia.iterdir()):
            for name in ("bin", "lib"):
                folder = sub / name
                if folder.is_dir() and str(folder) not in added:
                    added.append(str(folder))
    for folder in added:
        os.environ["PATH"] = folder + os.pathsep + os.environ.get("PATH", "")
        if hasattr(os, "add_dll_directory"):
            try:
                os.add_dll_directory(folder)
            except OSError:
                pass
    return added


def cuda_available() -> bool:
    add_cuda_runtime_paths()
    try:
        import ctranslate2

        return ctranslate2.get_cuda_device_count() > 0
    except Exception:
        return False


# --------------------------------------------------------------------------- #
# Audio
# --------------------------------------------------------------------------- #
def find_ffmpeg() -> Optional[str]:
    env = os.environ.get("FFMPEG_BIN")
    if env and Path(env).exists():
        return env
    return shutil.which("ffmpeg")


def extract_audio(source: Path, dest: Path) -> bool:
    """Video -> 16 kHz mono 16-bit WAV. False when FFmpeg is unavailable or fails."""
    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        return False
    cmd = [ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
           "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(dest)]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.returncode == 0 and dest.exists() and dest.stat().st_size > 1000


# --------------------------------------------------------------------------- #
# Model
# --------------------------------------------------------------------------- #
_models: dict[tuple[str, str, str], object] = {}


def load_model(name: str, device: str, compute_type: str):
    key = (name, device, compute_type)
    if key not in _models:
        from faster_whisper import WhisperModel

        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        _models[key] = WhisperModel(name, device=device, compute_type=compute_type, download_root=str(MODEL_DIR))
    return _models[key]


def resolve_device(requested: str) -> tuple[str, str]:
    """('cuda'|'cpu', compute_type) for a request of 'auto', 'cuda' or 'cpu'."""
    if requested in ("auto", "cuda") and cuda_available():
        return "cuda", "float16"
    if requested == "cuda":
        print("[whisper] CUDA requested but not available; using CPU", file=sys.stderr)
    return "cpu", "int8"


# --------------------------------------------------------------------------- #
# Transcription
# --------------------------------------------------------------------------- #
def _run(audio_path: str, model_name: str, device: str, compute_type: str, language: Optional[str],
         on_progress: Optional[ProgressFn]) -> dict:
    model = load_model(model_name, device, compute_type)
    segments_iter, info = model.transcribe(
        audio_path,
        language=language or None,
        beam_size=5,
        word_timestamps=True,
        condition_on_previous_text=False,
        initial_prompt=VERBATIM_PROMPT,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 700, "speech_pad_ms": 300},
        hallucination_silence_threshold=2.0,
    )
    duration = float(info.duration or 0.0)
    segments = []
    for seg in segments_iter:  # lazy: this loop is where decoding actually happens
        words = [
            {"word": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3), "probability": round(w.probability, 3)}
            for w in (seg.words or [])
            if w.word.strip()
        ]
        text = seg.text.strip()
        if not text:
            continue
        segments.append({"id": len(segments), "start": round(seg.start, 3), "end": round(seg.end, 3), "text": text, "words": words})
        if on_progress and duration:
            on_progress(min(1.0, seg.end / duration))
    return {
        "language": info.language,
        "languageProbability": round(float(info.language_probability or 0.0), 3),
        "duration": round(duration, 3),
        "text": " ".join(s["text"] for s in segments),
        "segments": segments,
    }


def transcribe(source: str | os.PathLike, *, model: str = DEFAULT_MODEL, device: str = "auto",
               language: Optional[str] = DEFAULT_LANGUAGE, on_progress: Optional[ProgressFn] = None) -> dict:
    """
    Transcribe a video/audio file. Returns the transcript dict plus a `meta` block
    saying how it was made (model, device, timings), which Apollo stores with it.
    """
    src = Path(source)
    if not src.is_file():
        raise TranscriptionError(f"file not found: {src}")

    started = time.time()
    with tempfile.TemporaryDirectory(prefix="apollo-audio-") as tmp:
        wav = Path(tmp) / "audio.wav"
        extracted = extract_audio(src, wav)
        audio_path = str(wav if extracted else src)
        extract_s = time.time() - started

        dev, compute = resolve_device(device)
        fell_back = False
        t0 = time.time()
        try:
            result = _run(audio_path, model, dev, compute, language, on_progress)
        except Exception as err:  # CUDA problems often only show up at the first decode
            if dev != "cuda":
                raise TranscriptionError(str(err)) from err
            print(f"[whisper] GPU run failed ({err}); retrying on CPU", file=sys.stderr)
            dev, compute, fell_back = "cpu", "int8", True
            t0 = time.time()
            try:
                result = _run(audio_path, model, dev, compute, language, on_progress)
            except Exception as err2:
                raise TranscriptionError(str(err2)) from err2
        decode_s = time.time() - t0

    if not result["segments"]:
        raise TranscriptionError("no speech was found in the audio")

    result["meta"] = {
        "engine": "faster-whisper",
        "model": model,
        "device": dev,
        "computeType": compute,
        "gpuFallback": fell_back,
        "audioExtractedWithFfmpeg": extracted,
        "extractSeconds": round(extract_s, 2),
        "transcribeSeconds": round(decode_s, 2),
        "realtimeFactor": round(result["duration"] / decode_s, 1) if decode_s > 0 else None,
        "language": language,
    }
    return result


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="Transcribe a video with faster-whisper (word timestamps).")
    ap.add_argument("source")
    ap.add_argument("--out", help="write the transcript JSON here (default: stdout)")
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--device", default="auto", choices=["auto", "cuda", "cpu"])
    ap.add_argument("--language", default=DEFAULT_LANGUAGE, help="ISO code, or 'auto' to detect")
    args = ap.parse_args(argv)

    last = [-1.0]

    def progress(p: float) -> None:
        if p - last[0] >= 0.05:
            last[0] = p
            print(f"PROGRESS {p:.3f}", file=sys.stderr, flush=True)

    try:
        result = transcribe(args.source, model=args.model, device=args.device,
                            language=None if args.language == "auto" else args.language, on_progress=progress)
    except TranscriptionError as err:
        print(f"ERROR {err}", file=sys.stderr)
        return 2

    payload = json.dumps(result, ensure_ascii=False, indent=2)
    if args.out:
        Path(args.out).write_text(payload, encoding="utf-8")
    else:
        sys.stdout.buffer.write(payload.encode("utf-8"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
