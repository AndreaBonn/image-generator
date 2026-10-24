import re
import tomllib
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent.parent
PEP723_BLOCK = re.compile(r"^# /// script$\s(?P<content>(^#(| .*)$\s)+)^# ///$", re.MULTILINE)


def declared_dependencies(script: Path) -> set[str]:
    """Dependencies from a script's PEP 723 block, as written in the manifest."""
    match = PEP723_BLOCK.search(script.read_text(encoding="utf-8"))
    if match is None:
        return set()
    toml_text = "\n".join(line[2:] for line in match["content"].splitlines())
    return set(tomllib.loads(toml_text).get("dependencies", []))


def test_declared_dependencies_reads_the_manifest_of_install_models():
    assert "huggingface_hub>=0.25" in declared_dependencies(SCRIPTS_DIR / "install_models.py")


def test_install_declares_every_dependency_of_the_siblings_it_loads():
    # install.py loads its siblings by path inside its own uv environment, so their
    # own PEP 723 manifests are never read: install.py must carry their deps.
    own = declared_dependencies(SCRIPTS_DIR / "install.py")
    for sibling in ("install_models", "install_plan", "install_detect", "install_runner"):
        missing = declared_dependencies(SCRIPTS_DIR / f"{sibling}.py") - own
        assert not missing, f"install.py is missing {sorted(missing)} needed by {sibling}.py"
