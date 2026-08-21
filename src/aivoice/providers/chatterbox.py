from __future__ import annotations

import os
import inspect
from importlib.metadata import version
from pathlib import Path
from typing import Any

from ..errors import ProviderError
from ..models import ProviderResult


class ChatterboxMultilingualProvider:
    def __init__(
        self,
        *,
        device: str = "auto",
        seed: int = 0,
        exaggeration: float = 0.5,
        cfg_weight: float = 0.5,
        temperature: float = 0.8,
    ) -> None:
        if device not in {"auto", "cpu", "cuda"}:
            raise ProviderError(f"Unsupported device: {device}")
        self.requested_device = device
        self.seed = seed
        if not 0.0 <= exaggeration <= 2.0:
            raise ProviderError("exaggeration must be between 0 and 2")
        if not 0.0 <= cfg_weight <= 1.0:
            raise ProviderError("cfg_weight must be between 0 and 1")
        if not 0.05 <= temperature <= 2.0:
            raise ProviderError("temperature must be between 0.05 and 2")
        self.exaggeration = exaggeration
        self.cfg_weight = cfg_weight
        self.temperature = temperature
        self._model: Any | None = None
        self._torch: Any | None = None
        self._torchaudio: Any | None = None
        self._device: str | None = None
        self._model_version = os.getenv("CHATTERBOX_MULTILINGUAL_T3_MODEL", "v3")

    def _load(self) -> None:
        if self._model is not None:
            return
        project_root = Path(__file__).resolve().parents[3]
        model_cache = Path(
            os.getenv("AIVOICE_MODEL_CACHE", str(project_root / ".cache" / "huggingface"))
        ).expanduser().resolve()
        model_cache.mkdir(parents=True, exist_ok=True)
        os.environ.setdefault("HF_HOME", str(model_cache))
        os.environ.setdefault("HF_HUB_CACHE", str(model_cache / "hub"))
        try:
            import torch
            import torchaudio
            from chatterbox.mtl_tts import ChatterboxMultilingualTTS
        except ImportError as exc:
            raise ProviderError(
                'Chatterbox is not installed. Run: .\\.venv\\Scripts\\python.exe -m pip install -e ".[clone]"'
            ) from exc

        if self.requested_device == "cuda" and not torch.cuda.is_available():
            raise ProviderError("CUDA was requested, but no CUDA device is available")
        device = (
            "cuda"
            if self.requested_device == "cuda"
            or (self.requested_device == "auto" and torch.cuda.is_available())
            else "cpu"
        )
        try:
            load_parameters = inspect.signature(
                ChatterboxMultilingualTTS.from_pretrained
            ).parameters
            # chatterbox-tts 0.1.7 compares the value to the literal "cpu"
            # before choosing map_location, so a torch.device object breaks CPU loading.
            load_kwargs: dict[str, Any] = {"device": device}
            if "t3_model" in load_parameters:
                load_kwargs["t3_model"] = self._model_version
            else:
                self._model_version = f"package-{version('chatterbox-tts')}-default"
            self._model = ChatterboxMultilingualTTS.from_pretrained(**load_kwargs)
        except Exception as exc:  # model loaders raise several third-party exception types
            raise ProviderError(f"Unable to load Chatterbox multilingual model: {exc}") from exc
        self._torch = torch
        self._torchaudio = torchaudio
        self._device = device

    def synthesize(
        self,
        *,
        reference_audio: Path,
        text: str,
        language: str,
        output_path: Path,
    ) -> ProviderResult:
        self._load()
        assert self._model is not None
        assert self._torch is not None
        assert self._torchaudio is not None
        assert self._device is not None

        self._torch.manual_seed(self.seed)
        if self._device == "cuda":
            self._torch.cuda.manual_seed_all(self.seed)
        try:
            waveform = self._model.generate(
                text,
                language_id=language,
                audio_prompt_path=str(reference_audio),
                exaggeration=self.exaggeration,
                cfg_weight=self.cfg_weight,
                temperature=self.temperature,
            )
            if waveform.ndim == 1:
                waveform = waveform.unsqueeze(0)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            self._torchaudio.save(
                str(output_path),
                waveform.detach().cpu(),
                int(self._model.sr),
                encoding="PCM_S",
                bits_per_sample=16,
            )
        except Exception as exc:  # provider internals are outside this adapter's type boundary
            raise ProviderError(f"Chatterbox synthesis failed: {exc}") from exc

        if not output_path.is_file() or output_path.stat().st_size <= 44:
            raise ProviderError("Chatterbox returned no usable audio")
        return ProviderResult(
            provider="chatterbox",
            model=f"multilingual-{self._model_version}",
            device=self._device,
            sample_rate=int(self._model.sr),
            output_path=output_path,
            settings={
                "exaggeration": self.exaggeration,
                "cfg_weight": self.cfg_weight,
                "temperature": self.temperature,
            },
        )
