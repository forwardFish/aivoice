from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from aivoice.errors import MediaError
from aivoice.media import extract_reference_audio, inspect_wav, probe_video, resolve_clip
from tests.helpers import create_test_video


class MediaTests(unittest.TestCase):
    def test_probe_extract_and_quality_report(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            video = root / "sample.mp4"
            reference = root / "reference.wav"
            create_test_video(video, 12.0)

            probe = probe_video(video)
            self.assertTrue(probe.has_video)
            self.assertTrue(probe.has_audio)
            duration = resolve_clip(probe, 0.0, 10.0)
            extract_reference_audio(video, reference, start_seconds=0.0, duration_seconds=duration)
            quality = inspect_wav(reference)

            self.assertEqual(quality.sample_rate, 24_000)
            self.assertEqual(quality.channels, 1)
            self.assertEqual(quality.sample_width_bytes, 2)
            self.assertAlmostEqual(quality.duration_seconds, 10.0, delta=0.1)
            self.assertTrue(quality.acceptable)

    def test_rejects_reference_duration_outside_bounds(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            video = Path(temp_dir) / "sample.mp4"
            create_test_video(video, 12.0)
            probe = probe_video(video)
            with self.assertRaises(MediaError):
                resolve_clip(probe, 0.0, 5.0)


if __name__ == "__main__":
    unittest.main()
