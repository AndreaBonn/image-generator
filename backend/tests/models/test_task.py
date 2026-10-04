import pytest

from app.models.task import ParameterLimit, validate_default


def test_validate_default_accepts_non_numeric_value_without_min_or_max() -> None:
    """A limit with neither min nor max returns early, before the numeric-type check."""
    validate_default(name="style", value="warm", limit=ParameterLimit())


def test_validate_default_rejects_value_below_min() -> None:
    with pytest.raises(ValueError, match="defaults.steps"):
        validate_default(name="steps", value=1, limit=ParameterLimit(min=2, max=8))
