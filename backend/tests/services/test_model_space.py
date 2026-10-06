from app.services.model_space import digest_matches, has_room, lock_filename, staging_filename

GB = 1024**3


def test_has_room_true_when_plenty_of_space() -> None:
    assert has_room(free_bytes=20 * GB, size_bytes=1 * GB, min_free_gb=5) is True


def test_has_room_false_when_not_enough_space() -> None:
    assert has_room(free_bytes=8 * GB, size_bytes=4 * GB, min_free_gb=5) is False


def test_has_room_exactly_at_margin_is_admitted() -> None:
    # 10 GB free, 5 GB download, 5 GB margin: 10 - 5 == 5, admitted.
    assert has_room(free_bytes=10 * GB, size_bytes=5 * GB, min_free_gb=5) is True


def test_has_room_one_byte_under_margin_is_rejected() -> None:
    assert has_room(free_bytes=10 * GB - 1, size_bytes=5 * GB, min_free_gb=5) is False


def test_digest_matches_identical_hashes() -> None:
    digest = "36a340b5509b699d2c06cb445ddc1d3d39199ac734d889ed6d7915f60e05bcbc"
    assert digest_matches(actual=digest, expected=digest) is True


def test_digest_matches_case_insensitive() -> None:
    digest = "36a340b5509b699d2c06cb445ddc1d3d39199ac734d889ed6d7915f60e05bcbc"
    assert digest_matches(actual=digest.upper(), expected=digest) is True


def test_digest_matches_different_hashes_rejected() -> None:
    assert digest_matches(actual="a" * 64, expected="b" * 64) is False


def test_staging_filename_is_stable_for_a_given_model_id() -> None:
    assert staging_filename(model_id="ultrasharp_4x") == staging_filename(model_id="ultrasharp_4x")


def test_staging_filename_differs_per_model_id() -> None:
    assert staging_filename(model_id="ultrasharp_4x") != staging_filename(
        model_id="juggernaut_xl_v8"
    )


def test_lock_filename_is_stable_and_distinct_from_staging_filename() -> None:
    assert lock_filename(model_id="ultrasharp_4x") == lock_filename(model_id="ultrasharp_4x")
    assert lock_filename(model_id="ultrasharp_4x") != staging_filename(model_id="ultrasharp_4x")
