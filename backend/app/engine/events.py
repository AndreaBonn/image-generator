import logging
from typing import Any

from app.engine.types import (
    Failed,
    ImageReference,
    Interrupted,
    OutputImages,
    ParsedEvent,
    Progress,
    Started,
    Succeeded,
)
from app.engine.workflow_builder import Graph
from app.errors import EngineExecutionError, OutOfMemoryError

logger = logging.getLogger(__name__)


def find_node(graph: Graph, title: str, fallback_class: str | None = None) -> str | None:
    for node_id, node in graph.items():
        if node.get("_meta", {}).get("title") == title:
            return node_id
    if fallback_class is not None:
        return next(
            (key for key, node in graph.items() if node["class_type"] == fallback_class), None
        )
    return None


def parse_failure(data: dict[str, Any]) -> Failed:
    logger.error(
        "Engine execution error: prompt_id=%s type=%s",
        data.get("prompt_id"),
        data.get("exception_type"),
    )
    logger.debug("Engine execution error payload: %s", data)
    text = " ".join(
        str(data.get(key, "")) for key in ("exception_type", "exception_message")
    ).casefold()
    error = (
        OutOfMemoryError()
        if "outofmemory" in text or "out of memory" in text
        else EngineExecutionError()
    )
    return Failed(error=error)


class EventParser:
    def __init__(self, graph: Graph, prompt_id: str) -> None:
        self.prompt_id = prompt_id
        self.sampler_id = find_node(
            graph=graph, title="@sampler", fallback_class="SamplerCustomAdvanced"
        )
        self.output_id = find_node(graph=graph, title="@output")

    def parse(self, message: dict[str, Any]) -> ParsedEvent | None:
        data = message.get("data", {})
        if data.get("prompt_id") != self.prompt_id:
            return None
        match message.get("type"):
            case "execution_start":
                return Started()
            case "progress" if (
                self.sampler_id is not None and str(data.get("node")) == self.sampler_id
            ):
                return Progress(step=data["value"], total=data["max"])
            case "executed" if (
                self.output_id is not None and str(data.get("node")) == self.output_id
            ):
                return OutputImages(
                    images=tuple(
                        ImageReference.model_validate(obj=image)
                        for image in data.get("output", {}).get("images", [])
                    )
                )
            case "execution_success":
                return Succeeded()
            case "execution_error":
                return parse_failure(data=data)
            case "execution_interrupted":
                return Interrupted()
        return None
