import secrets

from app.errors import ModelNotInstalledError, ValidationError
from app.models.job import MAX_SEED, JobRequest, ResolvedJob, ResolvedParams
from app.models.task import Scalar, TaskDefinition
from app.services.style_service import StyleService
from app.services.task_catalog import TaskCatalog

GENERATION_TASKS = frozenset({"bozza", "qualita", "testo"})


def field_error(field: str, message: str) -> ValidationError:
    return ValidationError(details=[{"field": field, "message": message}])


def resolve_task(request: JobRequest, catalog: TaskCatalog, is_fake: bool) -> TaskDefinition:
    task = next((task for task in catalog.tasks if task.id == request.task_id), None)
    if task is None:
        raise ModelNotInstalledError(message="Il compito richiesto non è disponibile.")
    if task.id not in GENERATION_TASKS:
        raise ValidationError(message="Questo compito non è ancora supportato.")
    reason = catalog.unavailable_reason(task=task)
    has_workflow = catalog.repository.has_workflow(filename=task.workflow)
    if reason is not None and (not is_fake or not has_workflow):
        raise ModelNotInstalledError(message=reason)
    if not request.prompt.strip():
        raise field_error(field="prompt", message="Descrivi l'immagine da generare.")
    return task


def validate_limits(task: TaskDefinition, values: dict[str, Scalar]) -> None:
    for name, limit in task.limits.items():
        value = values.get(name)
        if value is None:
            continue
        invalid = bool(limit.options and value not in limit.options)
        if isinstance(value, (int, float)):
            invalid |= limit.min is not None and value < limit.min
            invalid |= limit.max is not None and value > limit.max
        if invalid:
            raise field_error(
                field=f"params.{name}", message="Valore fuori dai limiti del compito."
            )


def resolve_params(request: JobRequest, task: TaskDefinition) -> ResolvedParams:
    values = dict(task.defaults)
    overrides = request.params.model_dump(exclude_none=True, exclude={"style_ids"})
    values.update(overrides)
    if values.get("seed") is None:
        values["seed"] = secrets.randbelow(exclusive_upper_bound=MAX_SEED + 1)
    validate_limits(task=task, values=values)
    ratio = next(
        (ratio for ratio in task.aspect_ratios if ratio.id == values["aspect_ratio"]), None
    )
    if ratio is None:
        raise field_error(
            field="params.aspect_ratio", message="Formato non disponibile per questo compito."
        )
    style_ids = request.params.style_ids
    if style_ids is None:
        style_ids = task.default_styles
    return ResolvedParams.model_validate(
        obj={
            **values,
            "width": ratio.width,
            "height": ratio.height,
            "style_ids": list(style_ids) if task.supports_styles else [],
        }
    )


def resolve_job(
    request: JobRequest, catalog: TaskCatalog, styles: StyleService, is_fake: bool
) -> ResolvedJob:
    task = resolve_task(request=request, catalog=catalog, is_fake=is_fake)
    params = resolve_params(request=request, task=task)
    prompt, negative = request.prompt, request.negative_prompt if task.supports_negative else ""
    if task.supports_styles:
        prompt, negative = styles.apply_styles(
            prompt=prompt, negative=negative, style_ids=params.style_ids
        )
    return ResolvedJob(
        request=request, task=task, params=params, prompt_final=prompt, negative_final=negative
    )
