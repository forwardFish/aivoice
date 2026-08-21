from __future__ import annotations

import math
import struct
import wave
from pathlib import Path

from ..models import ProviderResult


class FakeVoiceProvider:
    """Deterministic test provider. It is never used by the production CLI."""

    def synthesize(
        self,
        *,
        reference_audio: Path,
        text: str,
        language: str,
        output_path: Path,
    ) -> ProviderResult:
        del reference_audio, language
        sample_rate = 24_000
        duration = max(1.0, min(3.0, len(text) * 0.06))
        frame_count = int(sample_rate * duration)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with wave.open(str(output_path), "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(sample_rate)
            frames = bytearray()
            for index in range(frame_count):
                value = int(7000 * math.sin(2 * math.pi * 330 * index / sample_rate))
                frames.extend(struct.pack("<h", value))
            wav_file.writeframes(bytes(frames))
        return ProviderResult(
            provider="fake",
            model="deterministic-sine-test-only",
            device="cpu",
            sample_rate=sample_rate,
            output_path=output_path,
            settings={},
        )
