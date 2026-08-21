from __future__ import annotations

import json
import tempfile
import unittest
import wave
from pathlib import Path

from aivoice.cli import discover_authorized_video
from aivoice.errors import ConsentRequiredError, MediaError, ProviderError, VoiceCloneError
from aivoice.models import CloneRequest
from aivoice.pipeline import run_pipeline
from aivoice.providers.fake import FakeVoiceProvider
from tests.helpers import create_test_video


class VoiceClonePipelineTests(unittest.TestCase):
    def test_existing_output_requires_explicit_overwrite(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            output = root / "result.wav"
            output.write_bytes(b"existing-result")
            request = CloneRequest(
                video_path=root / "missing.mp4",
                text="不会覆盖。",
                output_path=output,
                confirm_authorized=True,
            )
            with self.assertRaisesRegex(MediaError, "Output already exists"):
                run_pipeline(request, FakeVoiceProvider())
            self.assertEqual(output.read_bytes(), b"existing-result")

    def test_failed_overwrite_preserves_previous_result(self) -> None:
        class FailingProvider:
            def synthesize(self, *, reference_audio, text, language, output_path):
                del reference_audio, text, language
                output_path.write_bytes(b"partial")
                raise ProviderError("expected failure")

        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            video = root / "authorized.mp4"
            output = root / "result.wav"
            create_test_video(video, 12.0)
            output.write_bytes(b"previous-result")
            request = CloneRequest(
                video_path=video,
                text="生成会失败。",
                output_path=output,
                confirm_authorized=True,
                duration_seconds=10.0,
                overwrite=True,
            )
            with self.assertRaisesRegex(ProviderError, "expected failure"):
                run_pipeline(request, FailingProvider())
            self.assertEqual(output.read_bytes(), b"previous-result")

    def test_discovers_exactly_one_authorized_video(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            video = root / "authorized.mp4"
            video.write_bytes(b"placeholder")
            (root / "notes.txt").write_text("ignored", encoding="utf-8")
            self.assertEqual(discover_authorized_video(root), video.resolve())

    def test_rejects_ambiguous_authorized_video_folder(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            (root / "one.mp4").write_bytes(b"one")
            (root / "two.mov").write_bytes(b"two")
            with self.assertRaisesRegex(VoiceCloneError, "More than one video"):
                discover_authorized_video(root)

    def test_authorization_is_required_before_media_processing(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            request = CloneRequest(
                video_path=root / "missing.mp4",
                text="这段内容不应被生成。",
                output_path=root / "result.wav",
                confirm_authorized=False,
            )
            with self.assertRaises(ConsentRequiredError):
                run_pipeline(request, FakeVoiceProvider())
            self.assertFalse(request.output_path.exists())

    def test_video_to_generated_audio_with_fake_provider(self) -> None:
        text = "今天也要照顾好自己。"
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            video = root / "authorized.mp4"
            output = root / "result.wav"
            create_test_video(video, 12.0)
            request = CloneRequest(
                video_path=video,
                text=text,
                output_path=output,
                confirm_authorized=True,
                duration_seconds=10.0,
            )

            result = run_pipeline(request, FakeVoiceProvider())

            self.assertTrue(result.output_path.is_file())
            self.assertTrue(result.manifest_path.is_file())
            self.assertIsNone(result.reference_path)
            self.assertFalse((root / ".aivoice-tmp").exists())
            with wave.open(str(result.output_path), "rb") as wav_file:
                self.assertGreater(wav_file.getnframes(), 0)
                self.assertEqual(wav_file.getframerate(), 24_000)
            manifest_text = result.manifest_path.read_text(encoding="utf-8")
            self.assertNotIn(text, manifest_text)
            manifest = json.loads(manifest_text)
            self.assertTrue(manifest["ai_generated"])
            self.assertTrue(manifest["authorization_confirmed"])
            self.assertFalse(manifest["text"]["plaintext_stored"])
            self.assertEqual(manifest["provider"]["provider"], "fake")
            self.assertTrue(manifest["temporary_reference_deleted"])
            self.assertEqual(len(manifest["output"]["sha256"]), 64)


if __name__ == "__main__":
    unittest.main()
