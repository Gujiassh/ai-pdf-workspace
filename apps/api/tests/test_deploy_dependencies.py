import re
import tomllib
from pathlib import Path


API_ROOT = Path(__file__).resolve().parents[1]


def _canonicalize_package_name(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


def test_deploy_requirements_include_all_runtime_dependencies() -> None:
    pyproject = tomllib.loads((API_ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    runtime_dependencies = {
        _canonicalize_package_name(re.match(r"[A-Za-z0-9_.-]+", dependency).group())
        for dependency in pyproject["project"]["dependencies"]
    }
    deploy_dependencies = {
        _canonicalize_package_name(match.group(1))
        for line in (API_ROOT / "requirements.deploy.txt").read_text(encoding="utf-8").splitlines()
        if (match := re.match(r"^([A-Za-z0-9][A-Za-z0-9_.-]*)==", line))
    }

    missing_dependencies = runtime_dependencies - deploy_dependencies

    assert not missing_dependencies, (
        "apps/api/requirements.deploy.txt is stale; regenerate it with the uv export "
        f"command documented in that file. Missing: {sorted(missing_dependencies)}"
    )
