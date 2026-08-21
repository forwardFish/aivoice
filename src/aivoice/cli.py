from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Sequence

from .config import load_env_file
from .errors import VoiceCloneError
from .models import CloneRequest
from .pipeline import run_pipeline
from .providers.chatterbox import ChatterboxMultilingualProvider
from .providers.aliyun import AliyunCosyVoiceProvider


SUPPORTED_VIDEO_SUFFIXES = {".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v"}
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT_DIR = PROJECT_ROOT / "inputs" / "authorized"


def discover_authorized_video(input_dir: Path) -> Path:
    resolved = input_dir.expanduser().resolve()
    if not resolved.is_dir():
        raise VoiceCloneError(f"Authorized video directory does not exist: {resolved}")
    candidates = sorted(
        path
        for path in resolved.iterdir()
        if path.is_file() and path.suffix.lower() in SUPPORTED_VIDEO_SUFFIXES
    )
    if not candidates:
        raise VoiceCloneError(f"No supported video found in: {resolved}")
    if len(candidates) > 1:
        names = ", ".join(path.name for path in candidates[:8])
        raise VoiceCloneError(
            f"More than one video was found. Keep exactly one video in the folder: {names}"
        )
    return candidates[0]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="aivoice",
        description="Authorized video-to-cloned-voice technical spike",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    clone = subparsers.add_parser("clone", help="clone an authorized reference voice and synthesize text")
    clone.add_argument("--video", type=Path, help="authorized source video")
    clone.add_argument(
        "--input-dir",
        type=Path,
        default=DEFAULT_INPUT_DIR,
        help=f"auto-discovery folder when --video is omitted (default: {DEFAULT_INPUT_DIR})",
    )
    clone.add_argument("--text", required=True, help="Chinese text to synthesize (max 300 characters)")
    clone.add_argument("--output", required=True, type=Path, help="output .wav path")
    clone.add_argument("--start", type=float, default=0.0, help="reference clip start in seconds")
    clone.add_argument("--duration", type=float, help="reference clip duration, 10-30 seconds")
    clone.add_argument("--language", default="zh", choices=["zh"])
    clone.add_argument("--device", default="auto", choices=["auto", "cpu", "cuda"])
    clone.add_argument(
        "--provider",
        default="chatterbox",
        choices=["chatterbox", "aliyun-cosyvoice"],
    )
    clone.add_argument("--seed", type=int, default=0)
    clone.add_argument("--exaggeration", type=float, default=0.5)
    clone.add_argument("--cfg-weight", type=float, default=0.5)
    clone.add_argument("--temperature", type=float, default=0.8)
    clone.add_argument(
        "--enhance-reference",
        action="store_true",
        help="apply speech-band filtering, noise reduction, and loudness normalization",
    )
    clone.add_argument("--keep-reference", action="store_true")
    clone.add_argument(
        "--overwrite",
        action="store_true",
        help="replace existing output artifacts only after synthesis succeeds",
    )
    clone.add_argument(
        "--confirm-authorized",
        action="store_true",
        help="confirm permission to clone and synthesize this voice",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    load_env_file(PROJECT_ROOT / ".env.local")
    args = build_parser().parse_args(argv)
    if args.command != "clone":
        return 2
    try:
        if args.provider == "aliyun-cosyvoice":
            provider = AliyunCosyVoiceProvider.from_environment()
        else:
            provider = ChatterboxMultilingualProvider(
                device=args.device,
                seed=args.seed,
                exaggeration=args.exaggeration,
                cfg_weight=args.cfg_weight,
                temperature=args.temperature,
            )
    except VoiceCloneError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    try:
        video_path = args.video or discover_authorized_video(args.input_dir)
    except VoiceCloneError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    request = CloneRequest(
        video_path=video_path,
        text=args.text,
        output_path=args.output,
        confirm_authorized=args.confirm_authorized,
        start_seconds=args.start,
        duration_seconds=args.duration,
        language=args.language,
        keep_reference=args.keep_reference,
        overwrite=args.overwrite,
        enhance_reference=args.enhance_reference,
    )
    try:
        result = run_pipeline(request, provider)
    except VoiceCloneError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    print(
        json.dumps(
            {
                "status": "SUCCESS",
                "output": str(result.output_path),
                "manifest": str(result.manifest_path),
                "provider": result.provider_result.provider,
                "model": result.provider_result.model,
                "device": result.provider_result.device,
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
