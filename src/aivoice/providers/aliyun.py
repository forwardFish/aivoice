from __future__ import annotations

import hashlib
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests

from ..errors import ProviderError
from ..models import ProviderResult


class AliyunCosyVoiceProvider:
    """Alibaba Cloud Model Studio Voice Enrollment + CosyVoice adapter."""

    def __init__(
        self,
        *,
        api_key: str,
        api_host: str,
        workspace_id: str,
        target_model: str = "cosyvoice-v3.5-flash",
        preprocess: bool = True,
        registry_path: Path | None = None,
        session: requests.Session | None = None,
    ) -> None:
        if not api_key.strip():
            raise ProviderError("DASHSCOPE_API_KEY is missing")
        host = api_host.strip().rstrip("/")
        parsed = urlparse(host)
        if parsed.scheme != "https" or not parsed.hostname:
            raise ProviderError("DASHSCOPE_API_HOST must be an https URL")
        if not workspace_id.strip() or not parsed.hostname.startswith(workspace_id.strip() + "."):
            raise ProviderError("DASHSCOPE_WORKSPACE_ID does not match DASHSCOPE_API_HOST")
        if target_model not in {"cosyvoice-v3.5-flash", "cosyvoice-v3.5-plus"}:
            raise ProviderError(f"Unsupported Aliyun target model: {target_model}")

        self.api_key = api_key.strip()
        self.api_host = host
        self.workspace_id = workspace_id.strip()
        self.target_model = target_model
        self.preprocess = preprocess
        self.registry_path = registry_path or (
            Path(__file__).resolve().parents[3] / ".runtime" / "aliyun_voice_registry.json"
        )
        self.session = session or requests.Session()

    @classmethod
    def from_environment(cls) -> "AliyunCosyVoiceProvider":
        preprocess = os.getenv("AIVOICE_ALIYUN_PREPROCESS", "true").strip().lower() not in {
            "0",
            "false",
            "no",
        }
        return cls(
            api_key=os.getenv("DASHSCOPE_API_KEY", ""),
            api_host=os.getenv("DASHSCOPE_API_HOST", ""),
            workspace_id=os.getenv("DASHSCOPE_WORKSPACE_ID", ""),
            target_model=os.getenv("AIVOICE_TARGET_MODEL", "cosyvoice-v3.5-flash"),
            preprocess=preprocess,
        )

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    @staticmethod
    def _safe_error(response: requests.Response) -> str:
        try:
            payload = response.json()
            text = json.dumps(payload, ensure_ascii=False)
        except ValueError:
            text = response.text
        return text.strip()[:1000]

    @staticmethod
    def _sha256(path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as handle:
            for block in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(block)
        return digest.hexdigest()

    def _read_registry(self) -> dict[str, Any]:
        if not self.registry_path.is_file():
            return {"schema_version": 1, "voices": {}}
        try:
            payload = json.loads(self.registry_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {"schema_version": 1, "voices": {}}
        if not isinstance(payload.get("voices"), dict):
            payload["voices"] = {}
        return payload

    def _write_registry(self, registry: dict[str, Any]) -> None:
        self.registry_path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            "w",
            encoding="utf-8",
            dir=self.registry_path.parent,
            prefix="voice-registry-",
            suffix=".json",
            delete=False,
        ) as handle:
            json.dump(registry, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            temporary = Path(handle.name)
        temporary.replace(self.registry_path)

    def _get_upload_policy(self) -> dict[str, Any]:
        endpoints = [
            f"{self.api_host}/api/v1/uploads",
            "https://dashscope.aliyuncs.com/api/v1/uploads",
        ]
        last_error = ""
        for endpoint in endpoints:
            response = self.session.get(
                endpoint,
                headers=self._headers,
                params={"action": "getPolicy", "model": "voice-enrollment"},
                timeout=30,
            )
            if response.status_code == 200:
                try:
                    return response.json()["data"]
                except (KeyError, ValueError, TypeError) as exc:
                    raise ProviderError("Aliyun upload policy response is invalid") from exc
            last_error = self._safe_error(response)
            if response.status_code in {401, 403}:
                break
        raise ProviderError(f"Unable to obtain Aliyun upload policy: {last_error}")

    def _upload_temporary_audio(self, reference_audio: Path) -> str:
        policy = self._get_upload_policy()
        key = f"{policy['upload_dir']}/{reference_audio.name}"
        with reference_audio.open("rb") as audio_file:
            multipart = {
                "OSSAccessKeyId": (None, policy["oss_access_key_id"]),
                "Signature": (None, policy["signature"]),
                "policy": (None, policy["policy"]),
                "x-oss-object-acl": (None, policy["x_oss_object_acl"]),
                "x-oss-forbid-overwrite": (None, policy["x_oss_forbid_overwrite"]),
                "key": (None, key),
                "success_action_status": (None, "200"),
                "file": (reference_audio.name, audio_file, "audio/wav"),
            }
            response = self.session.post(policy["upload_host"], files=multipart, timeout=60)
        if response.status_code != 200:
            raise ProviderError(f"Aliyun temporary audio upload failed: {self._safe_error(response)}")
        return f"oss://{key}"

    def _enroll_voice(self, reference_audio: Path, reference_hash: str) -> str:
        audio_url = self._upload_temporary_audio(reference_audio)
        prefix = "av" + reference_hash[:8]
        response = self.session.post(
            f"{self.api_host}/api/v1/services/audio/tts/customization",
            headers={**self._headers, "X-DashScope-OssResourceResolve": "enable"},
            json={
                "model": "voice-enrollment",
                "input": {
                    "action": "create_voice",
                    "target_model": self.target_model,
                    "prefix": prefix,
                    "url": audio_url,
                    "language_hints": ["zh"],
                    "max_prompt_audio_length": 20,
                    "enable_preprocess": self.preprocess,
                    "enable_volume_normalization": "false",
                },
            },
            timeout=120,
        )
        if response.status_code != 200:
            raise ProviderError(f"Aliyun voice enrollment failed: {self._safe_error(response)}")
        try:
            voice_id = str(response.json()["output"]["voice_id"])
        except (KeyError, ValueError, TypeError) as exc:
            raise ProviderError("Aliyun voice enrollment response has no voice_id") from exc

        registry = self._read_registry()
        registry["voices"][f"{self.target_model}:{reference_hash}"] = {
            "voice_id": voice_id,
            "target_model": self.target_model,
            "reference_sha256": reference_hash,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        self._write_registry(registry)
        return voice_id

    def _voice_for_reference(self, reference_audio: Path) -> str:
        reference_hash = self._sha256(reference_audio)
        registry = self._read_registry()
        item = registry["voices"].get(f"{self.target_model}:{reference_hash}")
        if isinstance(item, dict) and item.get("voice_id"):
            return str(item["voice_id"])
        return self._enroll_voice(reference_audio, reference_hash)

    def synthesize(
        self,
        *,
        reference_audio: Path,
        text: str,
        language: str,
        output_path: Path,
    ) -> ProviderResult:
        voice_id = self._voice_for_reference(reference_audio)
        response = self.session.post(
            f"{self.api_host}/api/v1/services/audio/tts/SpeechSynthesizer",
            headers=self._headers,
            json={
                "model": self.target_model,
                "input": {
                    "text": text,
                    "voice": voice_id,
                    "format": "wav",
                    "sample_rate": 24000,
                    "language_hints": [language],
                    "seed": 0,
                },
            },
            timeout=120,
        )
        if response.status_code != 200:
            raise ProviderError(f"Aliyun CosyVoice synthesis failed: {self._safe_error(response)}")
        try:
            audio_url = str(response.json()["output"]["audio"]["url"])
        except (KeyError, ValueError, TypeError) as exc:
            raise ProviderError("Aliyun CosyVoice response has no audio URL") from exc
        audio_response = self.session.get(audio_url, timeout=120)
        if audio_response.status_code != 200 or not audio_response.content:
            raise ProviderError("Aliyun CosyVoice output download failed")
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(audio_response.content)
        return ProviderResult(
            provider="aliyun-cosyvoice",
            model=self.target_model,
            device="cloud",
            sample_rate=24000,
            output_path=output_path,
            settings={"preprocess": float(self.preprocess)},
        )
