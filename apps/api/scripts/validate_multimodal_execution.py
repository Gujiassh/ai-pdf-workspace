from __future__ import annotations

import argparse
import json
from pathlib import Path

from ai_pdf_api.services.multimodal_execution import build_multimodal_execution_report
from ai_pdf_api.services.multimodal_quality import load_multimodal_quality_suite


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate and report M402 multimodal execution evidence.")
    parser.add_argument("--repository-root", type=Path, default=Path(__file__).resolve().parents[3])
    parser.add_argument("--worker", type=Path, default=Path("docs/evals/artifacts/m402-v1/worker-execution.json"))
    parser.add_argument("--desktop", type=Path, default=Path("docs/evals/artifacts/m402-v1/playwright-desktop.json"))
    parser.add_argument("--mobile", type=Path, default=Path("docs/evals/artifacts/m402-v1/playwright-mobile.json"))
    parser.add_argument("--real-model", type=Path)
    parser.add_argument("--output", type=Path)
    return parser.parse_args()


def _resolve(root: Path, value: Path | None) -> Path | None:
    if value is None:
        return None
    return value.resolve() if value.is_absolute() else (root / value).resolve()


def main() -> None:
    args = parse_args()
    root = args.repository_root.resolve()
    golden, _failures, _quality_report = load_multimodal_quality_suite(
        root,
        root / "docs/evals/multimodal-golden-v1.json",
        root / "docs/evals/multimodal-failures-v1.json",
    )
    report = build_multimodal_execution_report(
        root,
        golden,
        worker_path=_resolve(root, args.worker),
        desktop_path=_resolve(root, args.desktop),
        mobile_path=_resolve(root, args.mobile),
        real_model_path=_resolve(root, args.real_model),
    )
    rendered = json.dumps(report, ensure_ascii=True, indent=2) + "\n"
    if args.output is None:
        print(rendered, end="")
        return
    output = _resolve(root, args.output)
    assert output is not None
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(rendered, encoding="utf-8")


if __name__ == "__main__":
    main()
