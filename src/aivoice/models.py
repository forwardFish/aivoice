from __future__ import annotations

from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class MediaProbe:
    duration_seconds: float
    has_video: bool
    has_audio: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class AudioQuality:
    duration_seconds: float
    sample_rate: int
    channels: int
    sample_width_bytes: int
    average_dbfs: float
    silent_ratio: float
    clipping_ratio: float
    active_seconds: float
    acceptable: bool
    warnings: tuple[str, ...]

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["warnings"] = list(self.warnings)
        return data


@dataclass(frozen=True)
class ProviderResult:
    provider: str
    model: str
    device: str
    sample_rate: int
    output_path: Path
    settings: dict[str, float] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["output_path"] = self.output_path.name
        return data


@dataclass(frozen=True)
class CloneRequest:
    video_path: Path
    text: str
    output_path: Path
    confirm_authorized: bool
    start_seconds: float = 0.0
    duration_seconds: float | None = None
    language: str = "zh"
    keep_reference: bool = False
    overwrite: bool = False
    enhance_reference: bool = False


@dataclass(frozen=True)
class PipelineResult:
    output_path: Path
    manifest_path: Path
    reference_path: Path | None
    provider_result: ProviderResult
    quality: AudioQuality
