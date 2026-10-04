import pytest

from app.errors import ValidationError
from app.models.style import Style
from app.services.style_service import StyleService


@pytest.fixture
def service() -> StyleService:
    return StyleService(
        styles=(
            Style(name="Photo", prompt="photo of {prompt}", negative_prompt="blur, bad"),
            Style(name="Sharp", prompt="sharp {prompt}", negative_prompt="bad, noise"),
            Style(name="Weighted", negative_prompt="(blur, bad:1.4), blur, [bad, noise]"),
        )
    )


def test_apply_styles_multiple_styles_composes_and_deduplicates(service: StyleService) -> None:
    ids = ["Photo", "Sharp"]
    assert service.apply_styles(prompt="a cat", negative="blur", style_ids=ids) == (
        "sharp photo of a cat",
        "blur, bad, noise",
    )
    assert ids == ["Photo", "Sharp"]
    assert service.apply_styles(prompt="a cat", negative="", style_ids=["Photo"]) == (
        "photo of a cat",
        "blur, bad",
    )


def test_apply_styles_weighted_groups_preserves_prompt_structure(service: StyleService) -> None:
    assert service.apply_styles(prompt="cat", negative="blur", style_ids=["Weighted"]) == (
        "cat",
        "blur, (blur, bad:1.4), [bad, noise]",
    )


def test_apply_styles_no_styles_preserves_original_text(service: StyleService) -> None:
    assert service.apply_styles(prompt="", negative="blur, blur", style_ids=[]) == (
        "",
        "blur, blur",
    )


@pytest.mark.parametrize("ids", [["missing"], ["Photo"] * 6])
def test_apply_styles_invalid_selection_rejects(service: StyleService, ids: list[str]) -> None:
    with pytest.raises(ValidationError):
        service.apply_styles(prompt="cat", negative="", style_ids=ids)


def test_search_styles_query_matches_name_case_insensitively(service: StyleService) -> None:
    assert [style.name for style in service.search_styles(query="PHO")] == ["Photo"]
    assert service.search_styles(query="missing") == ()
    assert len(service.search_styles(query="")) == 3
