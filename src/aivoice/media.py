from __future__ import annotations

import array
import json
import math
import shutil
import subprocess
import sys
import wave
from pathlib import Path

from .errors import MediaError
from .models import AudioQuality, MediaProbe


MIN_REFERENCE_SECONDS = 10.0
MAX_REFERENCE_SECONDS = 30.0
DEFAULT_REFERENCE_SECONDS = 20.0
TARGET_SAMPLE_RATE = 24_000


def _require_tool(name: str) -> str:
    resolved = shutil.which(name)
    if not resolved:
        raise MediaError(f"Required media tool is unavailable: {name}")
    return resolved


def _run(command: list[str]) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            command,
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or exc.stdout or "media command failed").strip()
        raise MediaError(detail[-1200:]) from exc


def probe_video(video_path: Path) -> MediaProbe:
    video_path = video_path.expanduser().resolve()
    if not video_path.is_file():
        raise MediaError(f"Video file does not exist: {video_path}")

    ffprobe = _require_tool("ffprobe")
    completed = _run(
        [
            ffprobe,
            "-v",
            "error",
            "-show_entries",
            "format=duration:stream=codec_type",
            "-of",
            "json",
            str(video_path),
        ]
    )
    try:
        payload = json.loads(completed.stdout)
        duration = float(payload.get("format", {}).get("duration", 0.0))
        stream_types = {item.get("codec_type") for item in payload.get("streams", [])}
    except (TypeError, ValueError, json.JSONDecodeError) as exc:
        raise MediaError("FFprobe returned invalid media metadata") from exc

    probe = MediaProbe(
        duration_seconds=duration,
        has_video="video" in stream_types,
        has_audio="audio" in stream_types,
    )
    if duration <= 0 or not probe.has_video or not probe.has_audio:
        raise MediaError("Input must be a decodable video with an audio stream")
    return probe


def resolve_clip(probe: MediaProbe, start_seconds: float, duration_seconds: float | None) -> float:
    if start_seconds < 0:
        raise MediaError("Clip start must be zero or greater")
    available = probe.duration_seconds - start_seconds
    if available < MIN_REFERENCE_SECONDS:
        raise MediaError(
            f"At least {MIN_REFERENCE_SECONDS:.0f} seconds of audio are required after the clip start"
        )

    selected = duration_seconds if duration_seconds is not None else min(DEFAULT_REFERENCE_SECONDS, available)
    if selected < MIN_REFERENCE_SECONDS or selected > MAX_REFERENCE_SECONDS:
        raise MediaError(
            f"Reference duration must be between {MIN_REFERENCE_SECONDS:.0f} and "
            f"{MAX_REFERENCE_SECONDS:.0f} seconds"
        )
    if start_seconds + selected > probe.duration_seconds + 0.05:
        raise MediaError("Selected clip extends past the end of the video")
    return selected


def extract_reference_audio(
    video_path: Path,
    output_path: Path,
    *,
    start_seconds: float,
    duration_seconds: float,
    enhance_reference: bool = False,
) -> None:
    ffmpeg = _require_tool("ffmpeg")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    command = [
            ffmpeg,
            "-hide_banner",
            "-nostdin",
            "-loglevel",
            "error",
            "-y",
            "-ss",
            f"{start_seconds:.3f}",
            "-i",
            str(video_path),
            "-t",
            f"{duration_seconds:.3f}",
            "-vn",
            "-ac",
            "1",
            "-ar",
            str(TARGET_SAMPLE_RATE),
    ]
    if enhance_reference:
        command.extend(
            [
                "-af",
                "highpass=f=70,lowpass=f=10000,afftdn=nf=-25:tn=1,loudnorm=I=-20:TP=-2:LRA=7",
            ]
        )
    command.extend(
        [
            "-c:a",
            "pcm_s16le",
            str(output_path),
        ]
    )
    _run(command)
    if not output_path.is_file() or output_path.stat().st_size <= 44:
        raise MediaError("FFmpeg did not produce a usable reference WAV")


def inspect_wav(path: Path, *, enforce_reference_rules: bool = True) -> AudioQuality:
    try:
        with wave.open(str(path), "rb") as wav_file:
            channels = wav_file.getnchannels()
            sample_width = wav_file.getsampwidth()
            sample_rate = wav_file.getframerate()
            frame_count = wav_file.getnframes()
            raw = wav_file.readframes(frame_count)
    except (wave.Error, OSError) as exc:
        raise MediaError(f"WAV is not decodable: {path}") from exc

    if sample_width != 2:
        raise MediaError("Only 16-bit PCM WAV is supported by the quality inspector")
    samples = array.array("h")
    samples.frombytes(raw)
    if sys.byteorder != "little":
        samples.byteswap()
    if not samples or sample_rate <= 0 or channels <= 0:
        raise MediaError("WAV contains no audio samples")

    duration = frame_count / float(sample_rate)
    square_sum = sum(sample * sample for sample in samples)
    rms = math.sqrt(square_sum / len(samples))
    average_dbfs = 20.0 * math.log10(max(rms, 1.0) / 32768.0)
    clipping_ratio = sum(abs(sample) >= 32760 for sample in samples) / len(samples)

    window_samples = max(1, int(sample_rate * channels * 0.05))
    silence_threshold = 32768.0 * (10.0 ** (-45.0 / 20.0))
    silent_windows = 0
    total_windows = 0
    for offset in range(0, len(samples), window_samples):
        window = samples[offset : offset + window_samples]
        if not window:
            continue
        window_rms = math.sqrt(sum(sample * sample for sample in window) / len(window))
        silent_windows += int(window_rms < silence_threshold)
        total_windows += 1
    silent_ratio = silent_windows / max(total_windows, 1)
    active_seconds = duration * (1.0 - silent_ratio)

    warnings: list[str] = []
    if average_dbfs < -35.0:
        warnings.append("reference audio is quieter than the PRD recommendation (-35 dBFS)")
    if silent_ratio > 0.40:
        warnings.append("silent ratio exceeds the PRD recommendation (40%)")
    if clipping_ratio >= 0.01:
        warnings.append("clipping ratio exceeds the PRD recommendation (1%)")

    acceptable = True
    if enforce_reference_rules:
        acceptable = (
            MIN_REFERENCE_SECONDS - 0.1 <= duration <= MAX_REFERENCE_SECONDS + 0.1
            and average_dbfs >= -45.0
            and silent_ratio <= 0.70
            and clipping_ratio < 0.05
            and active_seconds >= 3.0
        )

    return AudioQuality(
        duration_seconds=round(duration, 3),
        sample_rate=sample_rate,
        channels=channels,
        sample_width_bytes=sample_width,
        average_dbfs=round(average_dbfs, 3),
        silent_ratio=round(silent_ratio, 5),
        clipping_ratio=round(clipping_ratio, 7),
        active_seconds=round(active_seconds, 3),
        acceptable=acceptable,
        warnings=tuple(warnings),
    )
