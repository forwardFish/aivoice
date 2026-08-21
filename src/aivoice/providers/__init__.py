from .aliyun import AliyunCosyVoiceProvider
from .base import VoiceProvider
from .chatterbox import ChatterboxMultilingualProvider
from .fake import FakeVoiceProvider

__all__ = [
    "VoiceProvider",
    "AliyunCosyVoiceProvider",
    "ChatterboxMultilingualProvider",
    "FakeVoiceProvider",
]
