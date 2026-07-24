from __future__ import annotations

import argparse
import json
from pathlib import Path

from ai_pdf_api.services.multimodal_quality import load_multimodal_quality_suite


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate the layered PDF/Image internal quality suite.")
    parser.add_argument("--repository-root", type=Path, default=Path(__file__).resolve().parents[3])
    parser.add_argument("--golden", type=Path, default=Path("docs/evals/multimodal-golden-v1.json"))
    parser.add_argument("--failures", type=Path, default=Path("docs/evals/multimodal-failures-v1.json"))
    parser.add_argument("--output", type=Path)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    root = args.repository_root.resolve()
    golden_path = args.golden if args.golden.is_absolute() else root / args.golden
    failure_path = args.failures if args.failures.is_absolute() else root / args.failures
    _, _, report = load_multimodal_quality_suite(root, golden_path, failure_path)
    rendered = json.dumps(report, ensure_ascii=True, indent=2) + "\n"
    if args.output is None:
        print(rendered, end="")
        return
    output_path = args.output if args.output.is_absolute() else root / args.output
    output_path.write_text(rendered, encoding="utf-8")


if __name__ == "__main__":
    main()
