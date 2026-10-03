"""
Apollo Content Factory - where is the speaker's head?

A horizontal phone video has to become a vertical short, so Apollo needs to know where the person
sits in the frame. That needs a handful of frames, not the whole video: a few seconds at the start,
then one frame every 10 minutes (a person on a tripod barely moves; if they do, the next sample sees it).

Cost: zero. Detection is YuNet (a 230 KB face detector that ships with OpenCV's model zoo) running on
the CPU, on about six small frames. No frames leave the machine and nothing is billed.

    python framing.py video.mp4            ->  JSON on stdout

Frames come from FFmpeg, so the phone's rotation flag is applied (a phone often stores landscape video
upside-down plus a "rotate 180" tag; reading raw pixels would show the speaker inverted and no detector
would find a face). The detector also gets a second chance on the rotated-180 frame, in case the flag is wrong.
"""
from __future__ import annotations

import json
import os
import statistics
import subprocess
import sys
import urllib.request
from pathlib import Path
from typing import Optional

import numpy as np

HERE = Path(__file__).resolve().parent
MODEL_PATH = HERE / "models" / "face_detection_yunet_2023mar.onnx"
MODEL_URL = "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"

HEAD_SAMPLES = (1.0, 2.5, 4.0)  # seconds: "the first few seconds"
INTERVAL = 600.0  #               then every ten minutes
MIN_SCORE = 0.6
SAMPLE_WIDTH = 640  #             frames are shrunk to this width: plenty to find a face, fast to decode


def find_ffmpeg() -> Optional[str]:
    env = os.environ.get("FFMPEG_BIN")
    if env and Path(env).exists():
        return env
    from shutil import which

    return which("ffmpeg")


def find_ffprobe() -> Optional[str]:
    ff = find_ffmpeg()
    if ff:
        sibling = Path(ff).with_name("ffprobe.exe" if os.name == "nt" else "ffprobe")
        if sibling.exists():
            return str(sibling)
    from shutil import which

    return which("ffprobe")


def probe(video: Path) -> dict:
    """Duration and displayed size (after rotation) of a video."""
    ffprobe = find_ffprobe()
    if not ffprobe:
        raise RuntimeError("ffprobe not found")
    out = subprocess.run(
        [ffprobe, "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:stream_side_data=rotation:format=duration",
         "-of", "json", str(video)], capture_output=True, text=True, check=True).stdout
    data = json.loads(out)
    stream = data["streams"][0]
    width, height = int(stream["width"]), int(stream["height"])
    rotation = 0
    for sd in stream.get("side_data_list", []):
        if "rotation" in sd:
            rotation = int(round(float(sd["rotation"])))
    if abs(rotation) % 180 == 90:
        width, height = height, width
    return {"width": width, "height": height, "rotation": rotation, "duration": float(data["format"]["duration"])}


def grab_frame(video: Path, t: float) -> Optional[np.ndarray]:
    """One frame at time t as a BGR image, rotation applied, shrunk to SAMPLE_WIDTH."""
    import cv2

    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        raise RuntimeError("FFmpeg is needed to read frames. Install it or set FFMPEG_BIN.")
    proc = subprocess.run(
        [ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-ss", f"{t:.3f}", "-i", str(video), "-frames:v", "1",
         "-vf", f"scale={SAMPLE_WIDTH}:-2", "-f", "image2pipe", "-vcodec", "mjpeg", "-q:v", "3", "-"],
        capture_output=True)
    if proc.returncode != 0 or not proc.stdout:
        return None
    return cv2.imdecode(np.frombuffer(proc.stdout, np.uint8), cv2.IMREAD_COLOR)


def _model():
    if not MODEL_PATH.exists():
        MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)  # 230 KB, once
    import cv2

    return cv2.FaceDetectorYN.create(str(MODEL_PATH), "", (SAMPLE_WIDTH, SAMPLE_WIDTH), MIN_SCORE, 0.3, 5000)


def find_face(image: np.ndarray, detector=None):
    """The most prominent face in an image as normalised {x, y, w, h, score}, or None."""
    detector = detector or _model()
    h, w = image.shape[:2]
    detector.setInputSize((w, h))
    _, faces = detector.detect(image)
    if faces is None or not len(faces):
        return None
    best = max(faces, key=lambda f: f[2] * f[3] * f[14])  # area weighted by confidence
    x, y, bw, bh = (float(v) for v in best[:4])
    return {"x": round(max(0.0, x) / w, 4), "y": round(max(0.0, y) / h, 4), "w": round(bw / w, 4), "h": round(bh / h, 4), "score": round(float(best[14]), 3)}


def sample_times(duration: float) -> list[float]:
    times = [t for t in HEAD_SAMPLES if t < max(0.5, duration - 0.5)]
    t = INTERVAL
    while t < duration - 5:
        times.append(t)
        t += INTERVAL
    return times or [0.0]


def detect_framing(video: str | os.PathLike, times: Optional[list[float]] = None) -> dict:
    import cv2

    src = Path(video)
    info = probe(src)
    detector = _model()
    keyframes = []
    for t in times if times is not None else sample_times(info["duration"]):
        frame = grab_frame(src, t)
        face = find_face(frame, detector) if frame is not None else None
        flipped = False
        if face is None and frame is not None:
            # The rotation tag can be missing or wrong; look at the frame the other way up before giving up.
            face = find_face(cv2.rotate(frame, cv2.ROTATE_180), detector)
            flipped = face is not None
        keyframes.append({"t": round(t, 2), "face": face, **({"upsideDown": True} if flipped else {})})

    found = [k["face"] for k in keyframes if k["face"]]
    head = None
    if found:
        # The opening seconds define where the speaker sits; the median ignores a one-frame miss.
        opening = [k["face"] for k in keyframes[: len(HEAD_SAMPLES)] if k["face"]] or found
        med = lambda key: round(statistics.median(f[key] for f in opening), 4)  # noqa: E731
        head = {"x": med("x"), "y": med("y"), "w": med("w"), "h": med("h")}
    return {"method": "yunet", "width": info["width"], "height": info["height"], "duration": round(info["duration"], 2), "rotation": info["rotation"],
            "keyframes": keyframes, "head": head}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: python framing.py <video>", file=sys.stderr)
        sys.exit(1)
    json.dump(detect_framing(sys.argv[1]), sys.stdout, indent=2)
