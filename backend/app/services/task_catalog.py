import logging

from app.config import Settings
from app.models.task import ParameterLimit, ParameterSchema, TaskDefinition, TaskView
from app.repositories.catalog_repository import CatalogRepository, ModelEntry, WorkflowNode

logger = logging.getLogger(__name__)
MIGRATE_COMMAND = "uv run --script scripts/migrate_from_fooocus.py --apply"
INSTALL_COMMAND = "uv run --script scripts/install_models.py --install"


def model_install_hint(model: ModelEntry) -> str:
    """Return the CLI command that installs a single missing model.

    MIGRATE_COMMAND is only offered for Fooocus-migratable entries; every other
    model is installed with the generic install_models.py --install <id>.
    """
    if model.fooocus_migratable:
        return MIGRATE_COMMAND
    return f"{INSTALL_COMMAND} {model.id}"


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


class CatalogConsistencyError(ValueError):
    """A task violates an invariant `TaskDefinition`'s own validators should enforce."""


def single_workflow_filename(task: TaskDefinition) -> str:
    """Narrow `task.workflow` from `str | None`, raising instead of asserting.

    `TaskDefinition.validate_workflow_source` guarantees exactly one of `workflow` or
    `workflow_by_reference_count` is set, so this only raises if that invariant was
    bypassed after validation (e.g. a hand-built `TaskDefinition` in a test).
    """
    if task.workflow is None:
        raise CatalogConsistencyError(f"tasks.{task.id}: has no single workflow")
    return task.workflow


def reference_workflow_files(task: TaskDefinition) -> dict[int, str]:
    """Narrow `task.workflow_by_reference_count` (see `single_workflow_filename`)."""
    if task.workflow_by_reference_count is None:
        raise CatalogConsistencyError(f"tasks.{task.id}: has no workflow_by_reference_count")
    return task.workflow_by_reference_count


def task_workflow_files(task: TaskDefinition) -> list[str]:
    """Return every template filename a task relies on.

    A task declares exactly one of `workflow` (single template) or
    `workflow_by_reference_count` (one template per reference count); this
    collects the filenames so callers do not branch on which one is set.
    """
    if task.workflow_by_reference_count is not None:
        return list(reference_workflow_files(task=task).values())
    return [single_workflow_filename(task=task)]


def template_name_for(task: TaskDefinition, reference_count: int | None) -> str:
    """Pick the workflow filename a task runs with.

    Tasks with `workflow_by_reference_count` select one template per count (every
    count's bindings are checked at catalog load time, see
    `validate_reference_count_templates`); every other task ignores `reference_count`
    and always uses its single `workflow`.
    """
    if task.workflow_by_reference_count is not None:
        templates = reference_workflow_files(task=task)
        if reference_count is None or reference_count not in templates:
            raise CatalogConsistencyError(
                f"tasks.{task.id}: no template for reference_count={reference_count}"
            )
        return templates[reference_count]
    return single_workflow_filename(task=task)


def check_bindings_against_titles(
    task: TaskDefinition, titles: dict[str, WorkflowNode], filename: str
) -> None:
    for parameter, references in task.bindings.items():
        for reference in references:
            title, input_name = reference.rsplit(sep=".", maxsplit=1)
            if title not in titles or input_name not in titles[title].inputs:
                raise ValueError(
                    f"tasks.{task.id}.bindings.{parameter}: invalid reference {reference} "
                    f"in {filename}"
                )


def validate_single_workflow(task: TaskDefinition, repository: CatalogRepository) -> None:
    filename = single_workflow_filename(task=task)
    workflow = repository.read_workflow(filename=filename)
    if workflow is None:
        logger.warning(
            "Task %s: missing workflow %s; binding validation skipped", task.id, filename
        )
        return
    check_bindings_against_titles(
        task=task, titles=index_titles(workflow=workflow), filename=filename
    )


def validate_reference_count_templates(task: TaskDefinition, repository: CatalogRepository) -> None:
    """Every per-count template must exist and expose @input_image_K/@resize_K, K<=count.

    Unlike validate_single_workflow this raises instead of warning: the templates
    are checked-in artifacts the task promises to have, not models the user may
    still be installing, so a missing one here is a config error that must stop
    startup (T043).
    """
    templates = reference_workflow_files(task=task)
    for count, filename in templates.items():
        workflow = repository.read_workflow(filename=filename)
        if workflow is None:
            raise ValueError(
                f"tasks.{task.id}.workflow_by_reference_count[{count}]: missing workflow {filename}"
            )
        titles = index_titles(workflow=workflow)
        check_bindings_against_titles(task=task, titles=titles, filename=filename)
        for index in range(1, count + 1):
            for prefix in ("input_image", "resize"):
                reference_title = f"@{prefix}_{index}"
                if reference_title not in titles:
                    raise ValueError(
                        f"tasks.{task.id}.workflow_by_reference_count[{count}]={filename}: "
                        f"missing title {reference_title}"
                    )


def validate_bindings(task: TaskDefinition, repository: CatalogRepository) -> None:
    if task.workflow_by_reference_count is not None:
        validate_reference_count_templates(task=task, repository=repository)
        return
    validate_single_workflow(task=task, repository=repository)


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
        missing_workflow = any(
            not self.repository.has_workflow(filename=filename)
            for filename in task_workflow_files(task=task)
        )
        if missing_workflow:
            return "Il workflow per questo compito non è ancora disponibile."
        missing = [
            self.models[model_id]
            for model_id in task.model_ids
            if not self.repository.has_model(model=self.models[model_id])
        ]
        if missing:
            labels = ", ".join(model.label for model in missing)
            commands = dict.fromkeys(model_install_hint(model=model) for model in missing)
            return (
                f"Modelli non installati: {labels}. "
                f"Esegui {'; '.join(commands)}. Vedi Impostazioni."
            )
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
