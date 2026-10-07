"""Tests for engine/install_engine.py: pure planning (T095) and smoke test (T096).

Execution on Windows/macOS is NV (not verifiable on this machine): only the
pure, OS-parametrized logic is exercised for those two; real subprocess/git
execution is tested on the structure (argv lists, env, files), never by
actually running git/uv/ComfyUI.
"""

import pytest
from install_engine_support import DONE_STATE, EMPTY_STATE, install_engine

# --- T095: plan_install is pure and OS-parametrized -------------------------


@pytest.mark.parametrize("os_name", ["linux", "darwin", "windows"])
def test_plan_install_fresh_machine_has_nothing_done(os_name):
    steps = install_engine.plan_install(os_name, True, EMPTY_STATE)

    by_name = {step.name: step for step in steps}
    assert by_name["clone_comfyui"].done is False
    assert by_name["venv"].done is False
    assert by_name["torch_and_requirements"].done is False
    assert by_name["inpaint_nodes"].done is False
    assert by_name["model_paths"].done is False
    # Never skippable: always re-checked / re-run.
    assert by_name["space_check"].done is False
    assert by_name["smoke_test"].done is False


@pytest.mark.parametrize("os_name", ["linux", "darwin", "windows"])
def test_plan_install_already_installed_marks_clone_venv_torch_done(os_name):
    steps = install_engine.plan_install(os_name, True, DONE_STATE)

    by_name = {step.name: step for step in steps}
    assert by_name["clone_comfyui"].done is True
    assert by_name["venv"].done is True
    assert by_name["torch_and_requirements"].done is True
    assert by_name["inpaint_nodes"].done is True
    assert by_name["model_paths"].done is True


def test_plan_install_darwin_torch_description_has_no_cuda_index():
    steps = install_engine.plan_install("darwin", True, EMPTY_STATE)

    desc = next(s for s in steps if s.name == "torch_and_requirements").description
    assert "cu130" not in desc
    assert "MPS" in desc


def test_plan_install_linux_with_nvidia_mentions_cuda_index():
    steps = install_engine.plan_install("linux", True, EMPTY_STATE)

    desc = next(s for s in steps if s.name == "torch_and_requirements").description
    assert "cu130" in desc


def test_plan_install_linux_without_nvidia_uses_cpu_index():
    steps = install_engine.plan_install("linux", False, EMPTY_STATE)

    desc = next(s for s in steps if s.name == "torch_and_requirements").description
    assert "cpu" in desc


def test_plan_install_step_order_matches_shell_script():
    steps = install_engine.plan_install("linux", True, EMPTY_STATE)

    assert [s.name for s in steps] == [
        "space_check",
        "clone_comfyui",
        "venv",
        "torch_and_requirements",
        "inpaint_nodes",
        "model_paths",
        "smoke_test",
    ]


# --- has_nvidia_gpu -----------------------------------------------------------


def test_has_nvidia_gpu_true_when_nvidia_smi_on_path(monkeypatch):
    monkeypatch.setattr(install_engine.shutil, "which", lambda name: "/usr/bin/nvidia-smi")
    assert install_engine.has_nvidia_gpu() is True


def test_has_nvidia_gpu_false_when_absent(monkeypatch):
    monkeypatch.setattr(install_engine.shutil, "which", lambda name: None)
    assert install_engine.has_nvidia_gpu() is False


# --- detect_engine_state reads the real filesystem ---------------------------


def test_detect_engine_state_all_false_on_empty_dir(tmp_path):
    state = install_engine.detect_engine_state(tmp_path / "ComfyUI", "linux")

    assert state == EMPTY_STATE


def test_detect_engine_state_true_once_each_marker_exists(tmp_path):
    engine_dir = tmp_path / "ComfyUI"
    (engine_dir / ".git").mkdir(parents=True)
    venv_dir = engine_dir / ".venv"
    site_packages = venv_dir / "lib" / "python3.12" / "site-packages" / "torch"
    site_packages.mkdir(parents=True)
    (venv_dir / "bin").mkdir(parents=True)
    (venv_dir / "bin" / "python").touch()
    node_dir = engine_dir / "custom_nodes" / "comfyui-inpaint-nodes" / ".git"
    node_dir.mkdir(parents=True)
    (engine_dir / "extra_model_paths.yaml").touch()

    state = install_engine.detect_engine_state(engine_dir, "linux")

    assert state == DONE_STATE


def test_detect_engine_state_windows_site_packages_layout(tmp_path):
    engine_dir = tmp_path / "ComfyUI"
    venv_dir = engine_dir / ".venv"
    (venv_dir / "Scripts").mkdir(parents=True)
    (venv_dir / "Scripts" / "python.exe").touch()
    (venv_dir / "Lib" / "site-packages" / "torch").mkdir(parents=True)

    state = install_engine.detect_engine_state(engine_dir, "windows")

    assert state.venv_ready is True
    assert state.deps_installed is True


@pytest.mark.parametrize(
    "os_name,torch_subpath",
    [
        ("linux", ("lib", "python3.12", "site-packages", "torch")),
        ("darwin", ("lib", "python3.12", "site-packages", "torch")),
        ("windows", ("Lib", "site-packages", "torch")),
    ],
)
def test_detect_engine_state_torch_layout_matches_own_os(tmp_path, os_name, torch_subpath):
    """Each OS family's real venv layout is picked up as deps_installed."""
    venv_dir = tmp_path / "ComfyUI" / ".venv"
    venv_dir.joinpath(*torch_subpath).mkdir(parents=True)

    state = install_engine.detect_engine_state(tmp_path / "ComfyUI", os_name)

    assert state.deps_installed is True


@pytest.mark.parametrize(
    "os_name,other_os_torch_subpath",
    [
        ("linux", ("Lib", "site-packages", "torch")),
        ("darwin", ("Lib", "site-packages", "torch")),
        ("windows", ("lib", "python3.12", "site-packages", "torch")),
    ],
)
def test_detect_engine_state_torch_layout_of_other_os_is_not_detected(
    tmp_path, os_name, other_os_torch_subpath
):
    """A torch install laid out for a different OS family must not be seen as installed:
    the detection branches on os_name, it does not just glob for either layout."""
    venv_dir = tmp_path / "ComfyUI" / ".venv"
    venv_dir.joinpath(*other_os_torch_subpath).mkdir(parents=True)

    state = install_engine.detect_engine_state(tmp_path / "ComfyUI", os_name)

    assert state.deps_installed is False
