from pathlib import Path

import pytest
from install_support import install, install_models


class _Entry:
    def __init__(self, id, size_bytes=0, enabled=True, source="huggingface", family="sdxl"):
        self.id = id
        self.family = family
        self.size_bytes = size_bytes
        self.enabled = enabled
        self.source = source
        self.folder = "x"
        self.filename = f"{id}.bin"


def make_ctx(**overrides):
    base = {
        "repo_root": Path("/repo"),
        "data_dir": Path("/data"),
        "paths": install_models.Paths(models_dir=Path("/models")),
        "entries": (),
        "min_free_gb": 5.0,
    }
    base.update(overrides)
    return install.InstallContext(**base)


def test_models_budget_returns_none_when_no_models_step():
    ctx = make_ctx()
    steps = [install.Step(name="styles", description="Scarica stili")]

    assert install.models_budget(steps, ctx) is None


def test_models_budget_computes_from_step_model_ids(monkeypatch):
    entries = (_Entry("a", size_bytes=1_000_000_000), _Entry("b", size_bytes=2_000_000_000))
    ctx = make_ctx(entries=entries)
    steps = [
        install.Step(name="models", description="...", model_ids=("a", "b")),
    ]
    monkeypatch.setattr(install, "free_bytes_at", lambda path: 20_000_000_000)

    budget = install.models_budget(steps, ctx)

    assert budget.required_gb == 3.0
    assert budget.ok is True


def test_models_budget_rejects_when_free_bytes_too_low(monkeypatch):
    entries = (_Entry("a", size_bytes=10_000_000_000),)
    ctx = make_ctx(entries=entries, min_free_gb=5.0)
    steps = [install.Step(name="models", description="...", model_ids=("a",))]
    monkeypatch.setattr(install, "free_bytes_at", lambda path: 9_000_000_000)

    budget = install.models_budget(steps, ctx)

    assert budget.ok is False
    assert "9,0 GB" in budget.describe()


def test_execute_step_dispatches_engine(monkeypatch):
    calls = []
    monkeypatch.setattr(
        install.install_runner, "run_engine_step", lambda repo_root: calls.append(repo_root)
    )
    ctx = make_ctx(repo_root=Path("/repo"))

    install.execute_step(install.Step(name="engine", description="..."), ctx)

    assert calls == [Path("/repo")]


def test_execute_step_dispatches_backend_deps(monkeypatch):
    calls = []
    monkeypatch.setattr(
        install.install_runner, "run_backend_deps_step", lambda repo_root: calls.append(repo_root)
    )
    ctx = make_ctx(repo_root=Path("/repo"))

    install.execute_step(install.Step(name="backend_deps", description="..."), ctx)

    assert calls == [Path("/repo")]


def test_execute_step_dispatches_frontend_build(monkeypatch):
    calls = []
    monkeypatch.setattr(
        install.install_runner, "run_frontend_build_step", lambda repo_root: calls.append(repo_root)
    )
    ctx = make_ctx(repo_root=Path("/repo"))

    install.execute_step(install.Step(name="frontend_build", description="..."), ctx)

    assert calls == [Path("/repo")]


def test_execute_step_dispatches_styles(monkeypatch):
    calls = []
    monkeypatch.setattr(install, "run_styles_step", lambda: calls.append("ran"))
    ctx = make_ctx()

    install.execute_step(install.Step(name="styles", description="..."), ctx)

    assert calls == ["ran"]


def test_execute_step_dispatches_models(monkeypatch):
    calls = []
    monkeypatch.setattr(
        install.install_runner,
        "run_models_step",
        lambda **kwargs: calls.append(kwargs["model_ids"]),
    )
    ctx = make_ctx(entries=(_Entry("a"),))

    install.execute_step(install.Step(name="models", description="...", model_ids=("a",)), ctx)

    assert calls == [("a",)]


def test_execute_step_rejects_unknown_step_name():
    ctx = make_ctx()
    try:
        install.execute_step(install.Step(name="bogus", description="..."), ctx)
    except ValueError as exc:
        assert "bogus" in str(exc)
    else:
        raise AssertionError("expected ValueError for an unknown step name")


@pytest.mark.local_install
def test_main_dry_run_on_this_machine_reports_nothing_pending(capsys):
    """This repo's engine/backend/frontend/styles/models are already in place."""
    exit_code = install.main(["--dry-run"])

    captured = capsys.readouterr()
    assert exit_code == 0
    assert "Niente da scaricare" in captured.out


def test_main_dry_run_rejects_with_disk_budget_message(monkeypatch, tmp_path, capsys):
    entry = _Entry("needs_space", size_bytes=10_000_000_000)
    monkeypatch.setattr(install.install_models, "load_registry", lambda: [entry])
    monkeypatch.setenv("MODELS_DIR", str(tmp_path))  # empty: entry looks "missing"
    monkeypatch.setattr(install, "free_bytes_at", lambda path: 9_000_000_000)

    exit_code = install.main(["--dry-run", "--only", "models"])

    captured = capsys.readouterr()
    assert exit_code == 1
    assert "GB" in captured.out
    assert "Niente da scaricare" not in captured.out


def test_main_real_run_rejects_with_disk_budget_before_downloading_anything(
    monkeypatch, tmp_path, capsys
):
    entry = _Entry("needs_space", size_bytes=10_000_000_000)
    monkeypatch.setattr(install.install_models, "load_registry", lambda: [entry])
    monkeypatch.setenv("MODELS_DIR", str(tmp_path))  # empty: entry looks "missing"
    monkeypatch.setattr(install, "free_bytes_at", lambda path: 9_000_000_000)

    def fail_if_called(**kwargs):
        raise AssertionError("no download should run once the budget rejects")

    monkeypatch.setattr(install.install_runner, "run_models_step", fail_if_called)

    exit_code = install.main(["--only", "models"])

    captured = capsys.readouterr()
    assert exit_code == 1
    assert "GB" in captured.out


@pytest.mark.local_install
def test_main_only_models_skips_when_nothing_is_missing(capsys):
    """On this machine every enabled model is already installed."""
    exit_code = install.main(["--only", "models"])

    captured = capsys.readouterr()
    assert exit_code == 0
    assert "Niente da scaricare" in captured.out


def test_free_bytes_at_missing_models_dir_measures_nearest_existing_parent(tmp_path):
    missing = tmp_path / "engine" / "models"

    free = install.free_bytes_at(missing)

    assert free == install.shutil.disk_usage(tmp_path).free


def test_build_models_step_base_profile_reads_the_same_registry_as_install(monkeypatch):
    entries = [_Entry("sdxl_a", family="sdxl"), _Entry("flux_b", family="flux2_klein")]
    monkeypatch.setattr(install.install_models, "load_registry", lambda: entries)

    step = install.install_plan.build_models_step(
        profile="base", missing_model_ids=("sdxl_a", "flux_b")
    )

    assert step is not None
    assert step.model_ids == ("sdxl_a",)
