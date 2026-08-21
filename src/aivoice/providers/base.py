from __future__ import annotations

from pathlib import Path
from typing import Protocol

from ..models import ProviderResult


class VoiceProvider(Protocol):
    def synthesize(
        self,
        *,
        reference_audio: Path,
        text: str,
        language: str,
        output_path: Path,
    ) -> ProviderResult: ...
