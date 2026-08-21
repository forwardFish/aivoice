from __future__ import annotations

import hashlib
import json
import shutil
import tempfile
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path

from .errors import ConsentRequiredError, MediaError
from .media import extract_reference_audio, inspect_wav, probe_video, resolve_clip
from .models import CloneRequest, PipelineResult
from .providers.base import VoiceProvider


MAX_TEXT_CHARACTERS = 300


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _validate_request(request: CloneRequest) -> None:
    if not request.confirm_authorized:
        raise ConsentRequiredError(
            "Authorization confirmation is required before voice cloning or synthesis"
        )
    if not request.text.strip():
        raise MediaError("Synthesis text cannot be empty")
    if len(request.text) > MAX_TEXT_CHARACTERS:
        raise MediaError(f"Synthesis text cannot exceed {MAX_TEXT_CHARACTERS} characters")
    if request.language != "zh":
        raise MediaError("This technical spike currently accepts language=zh only")
    if request.output_path.suffix.lower() != ".wav":
        raise MediaError("Output path must use the .wav extension")


def run_pipeline(request: CloneRequest, provider: VoiceProvider) -> PipelineResult:
    _validate_request(request)
    video_path = request.video_path.expanduser().resolve()
    output_path = request.output_path.expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path = output_path.with_suffix(output_path.suffix + ".manifest.json")
    kept_reference_target = output_path.with_name(f"{output_path.stem}.reference.wav")
    protected_targets = [output_path, manifest_path]
    if request.keep_reference:
        protected_targets.append(kept_reference_target)
    existing_targets = [path for path in protected_targets if path.exists()]
    if existing_targets and not request.overwrite:
        names = ", ".join(path.name for path in existing_targets)
        raise MediaError(f"Output already exists; use --overwrite to replace it: {names}")

    probe = probe_video(video_path)
    clip_duration = resolve_clip(probe, request.start_seconds, request.duration_seconds)
    temp_root = output_path.parent / ".aivoice-tmp"
    temp_root.mkdir(parents=True, exist_ok=True)
    kept_reference: Path | None = None

    try:
        with tempfile.TemporaryDirectory(prefix="request-", dir=temp_root) as temp_dir:
            reference_path = Path(temp_dir) / "reference.wav"
            extract_reference_audio(
                video_path,
                reference_path,
                start_seconds=request.start_seconds,
                duration_seconds=clip_duration,
                enhance_reference=request.enhance_reference,
            )
            quality = inspect_wav(reference_path)
            if not quality.acceptable:
                raise MediaError(
                    "Reference audio failed minimum quality checks: " + "; ".join(quality.warnings)
                )

            temporary_output = Path(temp_dir) / "generated.wav"
            provider_result = provider.synthesize(
                reference_audio=reference_path,
                text=request.text,
                language=request.language,
                output_path=temporary_output,
            )
            inspect_wav(temporary_output, enforce_reference_rules=False)

            if request.keep_reference:
                kept_reference = kept_reference_target

            manifest = {
                "schema_version": 1,
                "status": "SUCCESS",
                "ai_generated": True,
                "authorization_confirmed": True,
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "source": {
                    "file_name": video_path.name,
                    "sha256": sha256_file(video_path),
                    "duration_seconds": round(probe.duration_seconds, 3),
                },
                "clip": {
                    "start_seconds": round(request.start_seconds, 3),
                    "duration_seconds": round(clip_duration, 3),
                    "enhanced": request.enhance_reference,
                },
                "text": {
                    "language": request.language,
                    "character_count": len(request.text),
                    "sha256": hashlib.sha256(request.text.encode("utf-8")).hexdigest(),
                    "plaintext_stored": False,
                },
                "reference_quality": quality.to_dict(),
                "provider": replace(provider_result, output_path=output_path).to_dict(),
                "output": {
                    "file_name": output_path.name,
                    "sha256": sha256_file(temporary_output),
                    "bytes": temporary_output.stat().st_size,
                },
                "temporary_reference_deleted": not request.keep_reference,
            }
            temporary_manifest = Path(temp_dir) / "manifest.json"
            temporary_manifest.write_text(
                json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            temporary_output.replace(output_path)
            temporary_manifest.replace(manifest_path)
            if request.keep_reference:
                shutil.copy2(reference_path, kept_reference_target)
            provider_result = replace(provider_result, output_path=output_path)
            return PipelineResult(
                output_path=output_path,
                manifest_path=manifest_path,
                reference_path=kept_reference,
                provider_result=provider_result,
                quality=quality,
            )
    finally:
        try:
            temp_root.rmdir()
        except OSError:
            pass
