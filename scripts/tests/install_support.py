import importlib.util
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "install.py"
spec = importlib.util.spec_from_file_location("install", SCRIPT)
install = importlib.util.module_from_spec(spec)
sys.modules["install"] = install
spec.loader.exec_module(install)

install_models = install.install_models
install_plan = install.install_plan
install_detect = install.install_detect
install_runner = install.install_runner
