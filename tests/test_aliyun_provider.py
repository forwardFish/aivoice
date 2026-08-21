from __future__ import annotations

import io
import json
import tempfile
import unittest
import wave
from pathlib import Path

from aivoice.providers.aliyun import AliyunCosyVoiceProvider


class FakeResponse:
    def __init__(self, status_code: int, payload=None, content: bytes = b"") -> None:
        self.status_code = status_code
        self._payload = payload
        self.content = content
        self.text = json.dumps(payload or {})

    def json(self):
        return self._payload


def wav_bytes() -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(24_000)
        wav_file.writeframes(b"\x00\x00" * 24_000)
    return buffer.getvalue()


class FakeSession:
    def __init__(self) -> None:
        self.calls = []

    def get(self, url, **kwargs):
        self.calls.append(("GET", url, kwargs))
        if url.endswith("/api/v1/uploads"):
            return FakeResponse(
                200,
                {
                    "data": {
                        "upload_dir": "dashscope-instant/test",
                        "oss_access_key_id": "temporary-id",
                        "signature": "temporary-signature",
                        "policy": "temporary-policy",
                        "x_oss_object_acl": "private",
                        "x_oss_forbid_overwrite": "true",
                        "upload_host": "https://temporary-upload.example",
                    }
                },
            )
        if url == "https://audio.example/result.wav":
            return FakeResponse(200, content=wav_bytes())
        raise AssertionError(f"Unexpected GET {url}")

    def post(self, url, **kwargs):
        self.calls.append(("POST", url, kwargs))
        if url == "https://temporary-upload.example":
            return FakeResponse(200, {})
        if url.endswith("/api/v1/services/audio/tts/customization"):
            return FakeResponse(200, {"output": {"voice_id": "cosyvoice-test-id"}})
        if url.endswith("/api/v1/services/audio/tts/SpeechSynthesizer"):
            return FakeResponse(
                200,
                {"output": {"audio": {"url": "https://audio.example/result.wav"}}},
            )
        raise AssertionError(f"Unexpected POST {url}")


class AliyunProviderTests(unittest.TestCase):
    def test_enrolls_reuses_voice_and_synthesizes_without_exposing_key(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            reference = root / "reference.wav"
            output_one = root / "one.wav"
            output_two = root / "two.wav"
            reference.write_bytes(wav_bytes())
            session = FakeSession()
            provider = AliyunCosyVoiceProvider(
                api_key="secret-test-key",
                api_host="https://ws-test.cn-beijing.maas.aliyuncs.com",
                workspace_id="ws-test",
                registry_path=root / "registry.json",
                session=session,
            )

            first = provider.synthesize(
                reference_audio=reference,
                text="第一次测试。",
                language="zh",
                output_path=output_one,
            )
            second = provider.synthesize(
                reference_audio=reference,
                text="第二次测试。",
                language="zh",
                output_path=output_two,
            )

            self.assertEqual(first.provider, "aliyun-cosyvoice")
            self.assertTrue(output_one.is_file())
            self.assertTrue(output_two.is_file())
            enrollment_calls = [
                call for call in session.calls if call[1].endswith("/customization")
            ]
            self.assertEqual(len(enrollment_calls), 1)
            enrollment_payload = enrollment_calls[0][2]["json"]
            self.assertEqual(enrollment_payload["model"], "voice-enrollment")
            self.assertEqual(
                enrollment_payload["input"]["target_model"],
                "cosyvoice-v3.5-flash",
            )
            self.assertTrue(enrollment_payload["input"]["url"].startswith("oss://"))
            registry_text = (root / "registry.json").read_text(encoding="utf-8")
            self.assertNotIn("secret-test-key", registry_text)


if __name__ == "__main__":
    unittest.main()
