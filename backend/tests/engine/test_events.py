import json
from pathlib import Path
from typing import Any

import pytest

from app.config import REPO_ROOT
from app.engine.events import EventParser, find_node
from app.engine.types import Failed, Interrupted, OutputImages, Progress, Started, Succeeded

FIXTURE = Path(__file__).parents[1] / "fixtures/ws/bozza_run.json"
PROMPT_ID = "c5a3efdb-d76c-42dc-9f2f-7b136d816d73"


def make_parser(filename: str = "sdxl_lightning_txt2img.json") -> EventParser:
    return EventParser(
        graph=json.loads((REPO_ROOT / "workflows" / filename).read_text()), prompt_id=PROMPT_ID
    )


def test_parser_real_run_filters_vae_progress_and_extracts_output() -> None:
    parser = make_parser()
    events = [parser.parse(message=message) for message in json.loads(FIXTURE.read_text())]
    progress = [event for event in events if isinstance(event, Progress)]
    assert [(event.step, event.total, event.preview_url) for event in progress] == [
        (1, 4, None),
        (2, 4, None),
        (3, 4, None),
        (4, 4, None),
    ]
    assert sum(isinstance(event, Started) for event in events) == 1
    assert sum(isinstance(event, Succeeded) for event in events) == 1
    outputs = [event for event in events if isinstance(event, OutputImages)]
    raw = next(m for m in json.loads(FIXTURE.read_text()) if m["type"] == "executed")
    assert [image.model_dump() for image in outputs[0].images] == raw["data"]["output"]["images"]


def test_find_node_returns_none_when_no_title_match_and_no_fallback() -> None:
    graph = {"1": {"class_type": "KSamplerAdvanced", "_meta": {"title": "sampler"}}}
    assert find_node(graph=graph, title="@output") is None


def test_parser_execution_interrupted_maps_to_interrupted_event() -> None:
    message: dict[str, Any] = {"type": "execution_interrupted", "data": {"prompt_id": PROMPT_ID}}
    assert make_parser().parse(message=message) == Interrupted()


def test_parser_flux_fallback_and_foreign_prompt_filter() -> None:
    parser = make_parser(filename="flux2_klein_txt2img.json")
    message: dict[str, Any] = {
        "type": "progress",
        "data": {"prompt_id": PROMPT_ID, "node": "11", "value": 2, "max": 4},
    }
    assert parser.parse(message=message) == Progress(step=2, total=4)
    message["data"]["prompt_id"] = "other"
    assert parser.parse(message=message) is None


@pytest.mark.parametrize(
    "exception_type,message,code",
    [
        ("torch.OutOfMemoryError", "CUDA allocation", "OUT_OF_MEMORY"),
        ("RuntimeError", "CUDA OUT OF MEMORY", "OUT_OF_MEMORY"),
        ("ValueError", "bad input", "ENGINE_EXECUTION_FAILED"),
    ],
)
def test_parser_execution_error_maps_real_source_fields(
    exception_type: str, message: str, code: str
) -> None:
    # Verified in engine/ComfyUI/execution.py:700-712 (handle_execution_error).
    payload = {
        "type": "execution_error",
        "data": {
            "prompt_id": PROMPT_ID,
            "node_id": "6",
            "node_type": "KSampler",
            "executed": ["1"],
            "exception_message": message,
            "exception_type": exception_type,
            "traceback": [],
            "current_inputs": {},
            "current_outputs": ["1"],
        },
    }
    event = make_parser().parse(message=payload)
    assert isinstance(event, Failed)
    assert event.error.code == code
