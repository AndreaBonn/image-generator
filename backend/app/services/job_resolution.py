import secrets

from app.errors import ModelNotInstalledError, ValidationError
from app.models.job import MAX_SEED, JobRequest, ResolvedJob, ResolvedParams
from app.models.task import Scalar, TaskDefinition
from app.services.style_service import StyleService
from app.services.task_catalog import TaskCatalog, reference_workflow_files, template_name_for

GENERATION_TASKS = frozenset({"bozza", "qualita", "testo", "foto"})
IMAGE_TASKS = frozenset(
    {
        "inpaint",
        "outpaint",
        "variazione_sottile",
        "variazione_forte",
        "upscale",
        "modifica_libera",
        "rimuovi_sfondo",
        "ingrandisci_rifinito",
    }
)


def is_reference_task(task: TaskDefinition) -> bool:
    """Whether a task picks its template from the reference count, not a single workflow.

    Derived from the task's own field instead of a hand-maintained id list: every task
    with `workflow_by_reference_count` set (crea_da_riferimenti, da_schizzo, in_posa) is
    implemented through the same reference-resolution path.
    """
    return task.workflow_by_reference_count is not None


def field_error(field: str, message: str) -> ValidationError:
    return ValidationError(details=[{"field": field, "message": message}])


def resolve_task(request: JobRequest, catalog: TaskCatalog, is_fake: bool) -> TaskDefinition:
    task = next((task for task in catalog.tasks if task.id == request.task_id), None)
    if task is None:
        raise ModelNotInstalledError(message="Il compito richiesto non è disponibile.")
    if is_reference_task(task=task):
        validate_references(request=request, task=task)
    elif task.id not in GENERATION_TASKS | IMAGE_TASKS:
        raise ValidationError(message="Questo compito non è ancora supportato.")
    reason = catalog.unavailable_reason(task=task)
    reference_count = len(request.references) if request.references is not None else None
    filename = template_name_for(task=task, reference_count=reference_count)
    has_workflow = catalog.repository.has_workflow(filename=filename)
    if reason is not None and (not is_fake or not has_workflow):
        raise ModelNotInstalledError(message=reason)
    requires_prompt = is_reference_task(task=task) or task.id in GENERATION_TASKS | {
        "inpaint",
        "modifica_libera",
    }
    if requires_prompt and not request.prompt.strip():
        raise field_error(field="prompt", message="Descrivi l'immagine da generare.")
    if task.id in IMAGE_TASKS:
        validate_image_request(request=request)
    return task


def validate_references(request: JobRequest, task: TaskDefinition) -> None:
    max_references = len(reference_workflow_files(task=task))
    min_references = task.min_references or 1
    references = request.references or []
    if min_references <= len(references) <= max_references:
        return
    if min_references == max_references:
        message = f"Scegli esattamente {min_references} immagini di riferimento."
    else:
        message = f"Scegli da {min_references} a {max_references} immagini di riferimento."
    raise field_error(field="references", message=message)


def validate_image_request(request: JobRequest) -> None:
    if request.input_upload_id is None and request.source_generation_id is None:
        raise field_error(field="input_upload_id", message="Scegli un'immagine di partenza.")
    if request.input_upload_id is not None and request.source_generation_id is not None:
        raise field_error(field="input_upload_id", message="Scegli una sola immagine di partenza.")
    if request.task_id == "inpaint" and request.mask_upload_id is None:
        raise field_error(field="mask_upload_id", message="Carica una maschera per la modifica.")
    if request.task_id == "outpaint" and not request.outpaint_directions:
        raise field_error(field="outpaint_directions", message="Scegli almeno una direzione.")
    if request.task_id == "upscale" and request.upscale_factor is None:
        raise field_error(field="upscale_factor", message="Scegli il fattore 2 o 4.")
    if request.task_id != "modifica_libera" and request.params.batch != 1:
        raise field_error(field="params.batch", message="Questo compito accetta una sola immagine.")


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
    if task.id in {"upscale", "rimuovi_sfondo"}:
        return resolve_upscale_params(request=request)
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


def resolve_upscale_params(request: JobRequest) -> ResolvedParams:
    seed = request.params.seed
    if seed is None:
        seed = secrets.randbelow(exclusive_upper_bound=MAX_SEED + 1)
    return ResolvedParams(
        aspect_ratio="", width=1, height=1, seed=seed, batch=1, steps=0, cfg=0, style_ids=[]
    )


def apply_prompt_prefix(prompt: str, task: TaskDefinition) -> str:
    if task.prompt_prefix is None:
        return prompt
    return f"{task.prompt_prefix.rstrip()} {prompt}"


def resolve_job(
    request: JobRequest, catalog: TaskCatalog, styles: StyleService, is_fake: bool
) -> ResolvedJob:
    task = resolve_task(request=request, catalog=catalog, is_fake=is_fake)
    params = resolve_params(request=request, task=task)
    prompt = apply_prompt_prefix(prompt=request.prompt, task=task)
    negative = request.negative_prompt if task.supports_negative else ""
    if task.supports_styles:
        prompt, negative = styles.apply_styles(
            prompt=prompt, negative=negative, style_ids=params.style_ids
        )
    return ResolvedJob(
        request=request, task=task, params=params, prompt_final=prompt, negative_final=negative
    )
