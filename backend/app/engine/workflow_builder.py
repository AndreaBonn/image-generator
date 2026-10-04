from copy import deepcopy
from typing import Any

from app.models.task import Scalar

Graph = dict[str, dict[str, Any]]


def build_workflow(
    template: Graph, bindings: dict[str, list[str]], values: dict[str, Scalar]
) -> Graph:
    graph = deepcopy(template)
    titles = {node.get("_meta", {}).get("title"): node for node in graph.values()}
    for parameter, references in bindings.items():
        for reference in references:
            title, input_name = reference.rsplit(sep=".", maxsplit=1)
            titles[title]["inputs"][input_name] = values[parameter]
    return graph
