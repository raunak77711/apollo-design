"""
Apollo Content Factory - a browser-friendly preview copy of a recording.

A phone records HEVC (often upside-down plus a rotate tag) at 10+ Mbps. Chrome cannot reliably play that,
and a 2.9 GB file is a poor thing to scrub through. The proxy is the same recording as 960x540 H.264 with
the rotation applied and a keyframe every second, about 1 Mbps: it plays anywhere, seeks instantly, and is
what the live short preview uses. The final render never uses it: that reads the original.

Uses the GPU encoder (NVENC) when FFmpeg has it, otherwise libx264.
"""
from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import Callable, Optional

import framing as F

PROXY_HEIGHT = 540


def has_encoder(ffmpeg: str, name: str) -> bool:
    try:
        out = subprocess.run([ffmpeg, "-hide_banner", "-encoders"], capture_output=True, text=True, timeout=20).stdout
        return name in out
    except Exception:
        return False


def build_proxy(src: str | os.PathLike, dest: str | os.PathLike, on_progress: Optional[Callable[[float], None]] = None) -> dict:
    ffmpeg = F.find_ffmpeg()
    if not ffmpeg:
        raise RuntimeError("FFmpeg is needed to build the preview copy. Install it or set FFMPEG_BIN.")
    info = F.probe(Path(src))
    dest_path = Path(dest)
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    part = dest_path.with_suffix(".part.mp4")

    nvenc = has_encoder(ffmpeg, "h264_nvenc")
    video = (["-c:v", "h264_nvenc", "-preset", "p4", "-rc", "vbr", "-cq", "30", "-b:v", "0"] if nvenc
             else ["-c:v", "libx264", "-preset", "veryfast", "-crf", "27"])
    cmd = [ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", str(src),
           "-vf", f"scale=-2:{PROXY_HEIGHT}", *video, "-pix_fmt", "yuv420p", "-g", "30", "-keyint_min", "30",
           "-c:a", "aac", "-b:a", "96k", "-ac", "2", "-movflags", "+faststart", "-progress", "pipe:1", str(part)]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    total = max(1.0, info["duration"])
    try:
        for line in proc.stdout:  # type: ignore[union-attr]
            if line.startswith("out_time_ms=") and on_progress:
                try:
                    on_progress(min(0.99, int(line.split("=")[1]) / 1_000_000 / total))
                except ValueError:
                    pass
        code = proc.wait()
        if code != 0:
            raise RuntimeError(f"FFmpeg failed building the preview copy: {proc.stderr.read()[-300:] if proc.stderr else code}")
        os.replace(part, dest_path)
    finally:
        if part.exists():
            part.unlink(missing_ok=True)
    return {"encoder": "h264_nvenc" if nvenc else "libx264", "height": PROXY_HEIGHT, "bytes": dest_path.stat().st_size, "duration": info["duration"]}
