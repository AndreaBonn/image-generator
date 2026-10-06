GB = 1024**3
STAGING_SUFFIX = ".part"
LOCK_SUFFIX = ".lock"


def has_room(*, free_bytes: int, size_bytes: int, min_free_gb: float) -> bool:
    """True when downloading `size_bytes` still leaves at least `min_free_gb` free."""
    return free_bytes - size_bytes >= min_free_gb * GB


def digest_matches(*, actual: str, expected: str) -> bool:
    """Case-insensitive sha256 comparison between the downloaded file and the registry."""
    return actual.lower() == expected.lower()


def staging_filename(*, model_id: str) -> str:
    """Name of the partial file written to MODELS_DIR/.downloads while a model downloads."""
    return f"{model_id}{STAGING_SUFFIX}"


def lock_filename(*, model_id: str) -> str:
    """Name of the lock file shared by the app and scripts/install_models.py.

    Whichever side downloads a given model id creates this file first and removes
    it when done; the other side refuses to start a second download for the same id.
    """
    return f"{model_id}{LOCK_SUFFIX}"
