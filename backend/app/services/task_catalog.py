import logging

from app.config import Settings
from app.models.task import ParameterLimit, ParameterSchema, TaskDefinition, TaskView
from app.repositories.catalog_repository import CatalogRepository, ModelEntry, WorkflowNode

logger = logging.getLogger(__name__)
MIGRATE_COMMAND = "uv run --script scripts/migrate_from_fooocus.py --apply"


def index_titles(workflow: dict[str, WorkflowNode]) -> dict[str, WorkflowNode]:
    titles: dict[str, WorkflowNode] = {}
    for node in workflow.values():
        title = node.metadata.get("title")
        if not isinstance(title, str) or not title.startswith("@"):
            continue
        if title in titles:
            raise ValueError(f"workflow has duplicate node title {title}")
        titles[title] = node
    return titles


def validate_bindings(task: TaskDefinition, repository: CatalogRepository) -> None:
    workflow = repository.read_workflow(filename=task.workflow)
    if workflow is None:
        logger.warning(
            "Task %s: missing workflow %s; binding validation skipped", task.id, task.workflow
        )
        return
    titles = index_titles(workflow=workflow)
    for parameter, references in task.bindings.items():
        for reference in references:
            title, input_name = reference.rsplit(sep=".", maxsplit=1)
            if title not in titles or input_name not in titles[title].inputs:
                raise ValueError(
                    f"tasks.{task.id}.bindings.{parameter}: invalid reference {reference}"
                )


def build_parameters(task: TaskDefinition) -> dict[str, ParameterSchema]:
    parameters: dict[str, ParameterSchema] = {}
    for name, default in task.defaults.items():
        limit = task.limits.get(name, ParameterLimit())
        options = list(limit.options)
        if name == "aspect_ratio":
            options = [ratio.id for ratio in task.aspect_ratios]
        parameters[name] = ParameterSchema(
            default=default, min=limit.min, max=limit.max, options=options
        )
    return parameters


class TaskCatalog:
    def __init__(
        self,
        tasks: list[TaskDefinition],
        models: dict[str, ModelEntry],
        repository: CatalogRepository,
    ) -> None:
        self.tasks = tasks
        self.models = models
        self.repository = repository

    def unavailable_reason(self, task: TaskDefinition) -> str | None:
        if not self.repository.has_workflow(filename=task.workflow):
            return "Il workflow per questo compito non è ancora disponibile."
        missing = [
            self.models[model_id]
            for model_id in task.model_ids
            if not self.repository.has_model(model=self.models[model_id])
        ]
        if missing:
            labels = ", ".join(model.label for model in missing)
            hint = (
                f"Esegui {MIGRATE_COMMAND}. Vedi Impostazioni."
                if any(model.source == "local" for model in missing)
                else "Vedi Impostazioni."
            )
            return f"Modelli non installati: {labels}. {hint}"
        return None

    def list_tasks(self) -> list[TaskView]:
        result: list[TaskView] = []
        for task in self.tasks:
            reason = self.unavailable_reason(task=task)
            result.append(
                TaskView(
                    **task.model_dump(),
                    available=reason is None,
                    unavailable_reason=reason,
                    parameters=build_parameters(task=task),
                )
            )
        return result


def load_catalog(settings: Settings) -> TaskCatalog:
    """Load and validate the task catalog, raising on invalid fields or bindings."""
    repository = CatalogRepository(settings=settings)
    tasks = repository.read_tasks().tasks
    models = repository.read_models()
    for task in tasks:
        unknown = set(task.model_ids) - models.keys()
        if unknown:
            raise ValueError(f"tasks.{task.id}.model_ids: unknown models {sorted(unknown)}")
        validate_bindings(task=task, repository=repository)
    return TaskCatalog(tasks=tasks, models=models, repository=repository)
