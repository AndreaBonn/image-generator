import pytest

from app.services.prompt_language import looks_italian


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Una casa con il giardino", True),
        ("UNA CITTÀ CON L’ACQUA", True),
        ("Una casa, con flowers", True),
        ("A house with the garden", False),
        ("una casa with the garden", False),
        ("una casa con the garden with flowers", False),
        ("con", False),
        ("", False),
        ("conchiglia della città", False),
        ("猫の絵", False),
    ],
)
def test_looks_italian_language_samples_expected_result(text: str, expected: bool) -> None:
    assert looks_italian(text=text) is expected
