import importlib.util
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "engine" / "install_engine.py"
spec = importlib.util.spec_from_file_location("install_engine", SCRIPT)
install_engine = importlib.util.module_from_spec(spec)
sys.modules["install_engine"] = install_engine
spec.loader.exec_module(install_engine)

platform_support = sys.modules["platform_support"]

EMPTY_STATE = install_engine.EngineState(
    comfy_cloned=False,
    venv_ready=False,
    deps_installed=False,
    inpaint_node_cloned=False,
    model_paths_written=False,
)
DONE_STATE = install_engine.EngineState(
    comfy_cloned=True,
    venv_ready=True,
    deps_installed=True,
    inpaint_node_cloned=True,
    model_paths_written=True,
)
