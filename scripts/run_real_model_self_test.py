from __future__ import annotations

import math
import shutil
import subprocess
import sys
import wave
from pathlib import Path

import torch

from aivoice.models import CloneRequest
from aivoice.pipeline import run_pipeline
from aivoice.providers.chatterbox import ChatterboxMultilingualProvider


PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = PROJECT_ROOT / "outputs" / "real-model-self-test"


def save_reference(provider: ChatterboxMultilingualProvider, path: Path) -> float:
    provider._load()
    assert provider._model is not None
    assert provider._torchaudio is not None
    assert provider._torch is not None
    provider._torch.manual_seed(0)
    prompt_text = (
        "这是一个完全由人工智能生成的测试声音，只用于验证视频提取、声音复刻和文字转语音的技术链路。"
        "它不对应任何真实人物，也不会用于产品展示或对外传播。"
    )
    waveform = provider._model.generate(prompt_text, language_id="zh")
    if waveform.ndim == 1:
        waveform = waveform.unsqueeze(0)
    minimum_frames = int(provider._model.sr * 12)
    if waveform.shape[-1] < minimum_frames:
        repetitions = math.ceil(minimum_frames / waveform.shape[-1])
        waveform = torch.cat([waveform] * repetitions, dim=-1)
    waveform = waveform[:, : max(minimum_frames, waveform.shape[-1])]
    provider._torchaudio.save(
        str(path),
        waveform.detach().cpu(),
        int(provider._model.sr),
        encoding="PCM_S",
        bits_per_sample=16,
    )
    with wave.open(str(path), "rb") as wav_file:
        return wav_file.getnframes() / wav_file.getframerate()


def make_video(reference_wav: Path, duration: float, output_video: Path) -> None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg is unavailable")
    subprocess.run(
        [
            ffmpeg,
            "-hide_banner",
            "-nostdin",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"color=c=black:s=640x360:r=25:d={duration:.3f}",
            "-i",
            str(reference_wav),
            "-shortest",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            str(output_video),
        ],
        check=True,
    )


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    reference_wav = OUTPUT_DIR / "synthetic-reference.wav"
    reference_video = OUTPUT_DIR / "synthetic-authorized-reference.mp4"
    output_wav = OUTPUT_DIR / "cloned-output.wav"
    provider = ChatterboxMultilingualProvider(device="cpu", seed=1)
    duration = save_reference(provider, reference_wav)
    make_video(reference_wav, duration, reference_video)
    result = run_pipeline(
        CloneRequest(
            video_path=reference_video,
            text="你好，这是一段由真实声音克隆模型生成的中文技术验证音频。",
            output_path=output_wav,
            confirm_authorized=True,
            duration_seconds=min(20.0, duration),
            overwrite=True,
        ),
        provider,
    )
    print(result.output_path)
    print(result.manifest_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
