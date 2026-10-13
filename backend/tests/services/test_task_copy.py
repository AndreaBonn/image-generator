"""User-facing copy in config/tasks.yaml must be Italian (CLAUDE.md conventions)."""

import re
from collections.abc import Callable
from typing import Any, cast

import pytest
import yaml

from app.config import REPO_ROOT

read_yaml = cast(Callable[[str], Any], yaml.safe_load)

# Words that occur in English prose but never in Italian ("a", "in" are shared).
ENGLISH_ONLY_WORDS = frozenset("the and of to with you your should for is are only that".split())
WORD_PATTERN = re.compile(pattern=r"[^\W\d_]+", flags=re.UNICODE)


def is_english(text: str) -> bool:
    words = WORD_PATTERN.findall(string=text.casefold())
    return any(word in ENGLISH_ONLY_WORDS for word in words)


def load_tasks() -> list[dict[str, Any]]:
    data = read_yaml((REPO_ROOT / "config" / "tasks.yaml").read_text(encoding="utf-8"))
    return cast(list[dict[str, Any]], data["tasks"])


def test_is_english_flags_english_sentence() -> None:
    assert is_english("Describe only what should appear inside the selected area.")


def test_is_english_accepts_italian_sentence() -> None:
    assert not is_english("Puoi scrivere in italiano o in inglese.")


@pytest.mark.parametrize("task", load_tasks(), ids=lambda task: task["id"])
def test_task_prompt_tips_are_italian(task: dict[str, Any]) -> None:
    english_tips = [tip for tip in task.get("prompt_tips", []) if is_english(tip)]
    assert english_tips == []


@pytest.mark.parametrize("task", load_tasks(), ids=lambda task: task["id"])
def test_task_copy_says_descrizione_not_prompt(task: dict[str, Any]) -> None:
    language = task.get("prompt_language", {})
    visible = [task["label"], task.get("description", ""), *task.get("prompt_tips", [])]
    visible += [language.get("label", ""), language.get("reason", "")]
    assert [text for text in visible if "prompt" in text.casefold()] == []
