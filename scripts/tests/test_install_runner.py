from pathlib import Path

from install_support import install_runner


def test_run_command_executes_argument_list_never_through_shell(monkeypatch):
    calls = []
    monkeypatch.setattr(
        install_runner.subprocess, "run", lambda args, **kwargs: calls.append((args, kwargs))
    )

    install_runner.run_command(["echo", "hi"], cwd=Path("/tmp"))

    (args, kwargs) = calls[0]
    assert args == ["echo", "hi"]
    assert kwargs["cwd"] == Path("/tmp")
    assert kwargs["check"] is True
    assert "shell" not in kwargs


def test_run_engine_step_invokes_install_engine_sh_via_bash(monkeypatch):
    calls = []
    monkeypatch.setattr(install_runner, "run_command", lambda args, **kw: calls.append(args))

    install_runner.run_engine_step(Path("/repo"))

    assert calls == [["bash", "/repo/engine/install_engine.sh"]]


def test_run_backend_deps_step_runs_uv_sync_in_backend_dir(monkeypatch):
    calls = []
    monkeypatch.setattr(
        install_runner, "run_command", lambda args, **kw: calls.append((args, kw.get("cwd")))
    )

    install_runner.run_backend_deps_step(Path("/repo"))

    assert calls == [(["uv", "sync"], Path("/repo/backend"))]


def test_run_frontend_build_step_runs_npm_ci_then_npm_run_build(monkeypatch):
    calls = []
    monkeypatch.setattr(
        install_runner, "run_command", lambda args, **kw: calls.append((args, kw.get("cwd")))
    )

    install_runner.run_frontend_build_step(Path("/repo"))

    frontend = Path("/repo/frontend")
    assert calls == [
        (["npm", "ci"], frontend),
        (["npm", "run", "build"], frontend),
    ]


class _Entry:
    def __init__(self, id):
        self.id = id


def test_run_models_step_downloads_each_requested_model_by_id():
    entries = [_Entry("a"), _Entry("b"), _Entry("c")]
    calls = []

    install_runner.run_models_step(
        model_ids=("a", "c"),
        entries=entries,
        paths="paths-sentinel",
        min_free_gb=5.0,
        download_fn=lambda entry, paths, min_free_gb: calls.append((entry.id, paths, min_free_gb)),
    )

    assert calls == [("a", "paths-sentinel", 5.0), ("c", "paths-sentinel", 5.0)]


def test_run_models_step_skips_ids_not_requested():
    entries = [_Entry("a"), _Entry("b")]
    calls = []

    install_runner.run_models_step(
        model_ids=(),
        entries=entries,
        paths="paths-sentinel",
        min_free_gb=5.0,
        download_fn=lambda entry, paths, min_free_gb: calls.append(entry.id),
    )

    assert calls == []
