class VoiceCloneError(RuntimeError):
    """Base error for expected pipeline failures."""


class ConsentRequiredError(VoiceCloneError):
    """Raised before processing when authorization was not confirmed."""


class MediaError(VoiceCloneError):
    """Raised when media validation or extraction fails."""


class ProviderError(VoiceCloneError):
    """Raised when a voice provider cannot synthesize audio."""
