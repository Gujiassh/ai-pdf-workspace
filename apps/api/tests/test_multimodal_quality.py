import hashlib
import json
import shutil
from copy import deepcopy
from pathlib import Path

import pytest

from ai_pdf_api.services.multimodal_quality import QualityDataError, load_multimodal_quality_suite


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
GOLDEN_PATH = REPOSITORY_ROOT / "docs/evals/multimodal-golden-v1.json"
FAILURE_PATH = REPOSITORY_ROOT / "docs/evals/multimodal-failures-v1.json"


def load_payload(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_payload(path: Path, payload: dict) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def materialize_quality_repository(root: Path) -> tuple[Path, Path, dict, dict]:
    golden = load_payload(GOLDEN_PATH)
    failures = load_payload(FAILURE_PATH)
    relative_paths = {
        *(baseline["filePath"] for baseline in golden["referenceBaselines"]),
        *(fixture["sourcePath"] for fixture in golden["fixtures"]),
        *(fixture["manifestPath"] for fixture in golden["fixtures"]),
        *(sample["reproduction"]["testFile"] for sample in failures["samples"]),
    }
    for relative_path in relative_paths:
        destination = root / relative_path
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(REPOSITORY_ROOT / relative_path, destination)
    golden_path = write_payload(root / "docs/evals/multimodal-golden-v1.json", golden)
    failure_path = write_payload(root / "docs/evals/multimodal-failures-v1.json", failures)
    return golden_path, failure_path, golden, failures


def test_multimodal_quality_suite_has_required_layered_coverage() -> None:
    _, _, report = load_multimodal_quality_suite(REPOSITORY_ROOT, GOLDEN_PATH, FAILURE_PATH)
    samples = load_payload(FAILURE_PATH)["samples"]
    expected_argv = [
        [
            "uv",
            "run",
            "--project",
            "apps/api" if sample["reproduction"]["testFile"].startswith("apps/api/") else "apps/worker",
            "pytest",
            f'{sample["reproduction"]["testFile"]}::{sample["reproduction"]["testName"]}',
        ]
        for sample in samples
    ]
    assert report["failureRegistry"].pop("reproductionArgv") == expected_argv

    assert report == {
        "schemaVersion": "multimodal-quality-report-v1",
        "goldenSet": {
            "caseCount": 21,
            "fixtureCount": 3,
            "layers": {"retrieval": 7, "evidence": 7, "answer": 7},
            "modalities": {"pdf": 11, "image": 6, "mixed": 4},
            "taskTypes": {
                "chart": 3,
                "cross_asset_compare": 3,
                "exact_fact": 3,
                "image": 4,
                "method_constraints": 3,
                "no_answer": 2,
                "table": 3,
            },
            "refusalCaseCount": 2,
            "referenceBaselines": {
                "retrieval-pdf-real-v1": {"caseCount": 40, "modalities": ["pdf"]},
            },
        },
        "failureRegistry": {
            "sampleCount": 6,
            "regressionLockedCount": 6,
            "categories": {
                "asset_parse": 1,
                "retrieval_candidate": 1,
                "rrf_ranking": 1,
                "answer_support": 0,
                "evidence_localization": 1,
                "table_structure": 1,
                "visual_semantics": 1,
                "false_answer": 0,
                "viewer_rendering": 0,
                "workflow": 0,
            },
        },
        "coveragePassed": True,
    }


def test_multimodal_quality_suite_rejects_unknown_fields(tmp_path: Path) -> None:
    payload = load_payload(GOLDEN_PATH)
    payload["cases"][0]["guessedLocator"] = "first_available"

    with pytest.raises(QualityDataError, match="extra_forbidden"):
        load_multimodal_quality_suite(
            REPOSITORY_ROOT,
            write_payload(tmp_path / "golden.json", payload),
            FAILURE_PATH,
        )


def test_multimodal_quality_suite_rejects_fixture_hash_drift(tmp_path: Path) -> None:
    payload = load_payload(GOLDEN_PATH)
    payload["fixtures"][0]["sourceSha256"] = "0" * 64

    with pytest.raises(QualityDataError, match="hash mismatch"):
        load_multimodal_quality_suite(
            REPOSITORY_ROOT,
            write_payload(tmp_path / "golden.json", payload),
            FAILURE_PATH,
        )


def test_multimodal_quality_suite_rejects_manifest_hash_drift(tmp_path: Path) -> None:
    payload = load_payload(GOLDEN_PATH)
    payload["fixtures"][0]["manifestSha256"] = "0" * 64

    with pytest.raises(QualityDataError, match="manifest hash mismatch"):
        load_multimodal_quality_suite(
            REPOSITORY_ROOT,
            write_payload(tmp_path / "golden.json", payload),
            FAILURE_PATH,
        )


@pytest.mark.parametrize("mutation", ["coordinate_space", "geometry"])
def test_multimodal_quality_suite_rejects_semantic_image_manifest_drift(
    tmp_path: Path,
    mutation: str,
) -> None:
    golden_path, failure_path, golden, _ = materialize_quality_repository(tmp_path)
    fixture = next(item for item in golden["fixtures"] if item["id"] == "image-coordinate")
    manifest_path = tmp_path / fixture["manifestPath"]
    manifest = load_payload(manifest_path)
    if mutation == "coordinate_space":
        manifest["coordinateSpace"] = "invented_space"
        expected_error = "unsupported image coordinateSpace"
    else:
        manifest["regions"][0].update({"x": -3, "width": 9})
        expected_error = "positive normalized rectangle"
    write_payload(manifest_path, manifest)
    fixture["manifestSha256"] = hashlib.sha256(manifest_path.read_bytes()).hexdigest()
    write_payload(golden_path, golden)

    with pytest.raises(QualityDataError, match=expected_error):
        load_multimodal_quality_suite(tmp_path, golden_path, failure_path)


def test_multimodal_quality_suite_reuses_strict_retrieval_label_validation(tmp_path: Path) -> None:
    golden_path, failure_path, golden, _ = materialize_quality_repository(tmp_path)
    baseline = golden["referenceBaselines"][0]
    baseline_path = tmp_path / baseline["filePath"]
    rows = baseline_path.read_text(encoding="utf-8").splitlines()
    first = json.loads(rows[0])
    first["relevant"] = ["not-a-pdf-label"]
    rows[0] = json.dumps(first)
    baseline_path.write_text("\n".join(rows) + "\n", encoding="utf-8")
    baseline["sourceSha256"] = hashlib.sha256(baseline_path.read_bytes()).hexdigest()
    write_payload(golden_path, golden)

    with pytest.raises(QualityDataError, match="invalid relevant label"):
        load_multimodal_quality_suite(tmp_path, golden_path, failure_path)


def test_multimodal_quality_suite_rejects_target_outside_selected_scope(tmp_path: Path) -> None:
    payload = load_payload(GOLDEN_PATH)
    mixed_case = next(case for case in payload["cases"] if case["id"] == "retrieval-mixed-trend")
    mixed_case["scope"]["selectedFixtureIds"] = ["pdf-artifact-matrix"]

    with pytest.raises(QualityDataError, match="outside selected scope"):
        load_multimodal_quality_suite(
            REPOSITORY_ROOT,
            write_payload(tmp_path / "golden.json", payload),
            FAILURE_PATH,
        )


def test_multimodal_quality_suite_rejects_missing_manifest_region(tmp_path: Path) -> None:
    payload = load_payload(GOLDEN_PATH)
    image_case = next(case for case in payload["cases"] if case["id"] == "evidence-image-chart")
    image_case["evidenceTargets"][0]["regionLabels"] = ["first_available"]

    with pytest.raises(QualityDataError, match="missing image regions"):
        load_multimodal_quality_suite(
            REPOSITORY_ROOT,
            write_payload(tmp_path / "golden.json", payload),
            FAILURE_PATH,
        )


def test_multimodal_quality_suite_rejects_unreproducible_failure_sample(tmp_path: Path) -> None:
    payload = load_payload(FAILURE_PATH)
    payload["samples"][0]["reproduction"]["testName"] = "test_missing_regression"

    with pytest.raises(QualityDataError, match="has no persisted regression test"):
        load_multimodal_quality_suite(
            REPOSITORY_ROOT,
            GOLDEN_PATH,
            write_payload(tmp_path / "failures.json", payload),
        )


def test_multimodal_quality_suite_rejects_free_form_failure_commands(tmp_path: Path) -> None:
    payload = load_payload(FAILURE_PATH)
    payload["samples"][0]["reproduction"]["command"] = (
        "false apps/worker/tests/test_pdf.py::test_page_word_mapping_rejects_any_non_whitespace_parser_mismatch"
    )

    with pytest.raises(QualityDataError, match="extra_forbidden"):
        load_multimodal_quality_suite(
            REPOSITORY_ROOT,
            GOLDEN_PATH,
            write_payload(tmp_path / "failures.json", payload),
        )


def test_multimodal_quality_suite_rejects_noncanonical_failure_test_paths(tmp_path: Path) -> None:
    payload = load_payload(FAILURE_PATH)
    payload["samples"][0]["reproduction"]["testFile"] = "apps/api/tests/../../worker/tests/test_pdf.py"

    with pytest.raises(QualityDataError, match="canonical relative POSIX"):
        load_multimodal_quality_suite(
            REPOSITORY_ROOT,
            GOLDEN_PATH,
            write_payload(tmp_path / "failures.json", payload),
        )


def test_multimodal_quality_suite_rejects_non_module_test_symbols(tmp_path: Path) -> None:
    golden_path, failure_path, _, failures = materialize_quality_repository(tmp_path)
    nested_test_path = tmp_path / "apps/api/tests/test_nested.py"
    nested_test_path.parent.mkdir(parents=True, exist_ok=True)
    nested_test_path.write_text(
        "class TestNested:\n"
        "    def test_not_collectable_by_generated_node(self):\n"
        "        pass\n",
        encoding="utf-8",
    )
    failures["samples"][0]["reproduction"] = {
        "testFile": "apps/api/tests/test_nested.py",
        "testName": "test_not_collectable_by_generated_node",
    }
    write_payload(failure_path, failures)

    with pytest.raises(QualityDataError, match="has no persisted regression test"):
        load_multimodal_quality_suite(tmp_path, golden_path, failure_path)


def test_multimodal_quality_suite_rejects_thin_layer_coverage(tmp_path: Path) -> None:
    payload = load_payload(GOLDEN_PATH)
    payload["cases"] = [case for case in payload["cases"] if case["layer"] != "evidence"]

    with pytest.raises(QualityDataError, match="at least 20 cases"):
        load_multimodal_quality_suite(
            REPOSITORY_ROOT,
            write_payload(tmp_path / "golden.json", payload),
            FAILURE_PATH,
        )


def test_multimodal_quality_suite_requires_every_modality_in_every_layer(tmp_path: Path) -> None:
    payload = load_payload(GOLDEN_PATH)
    mixed_retrieval = next(case for case in payload["cases"] if case["id"] == "retrieval-mixed-trend")
    mixed_retrieval["layer"] = "answer"
    mixed_retrieval["expectedAnswerPoints"] = ["Both modalities are present."]

    with pytest.raises(QualityDataError, match="layer 'retrieval' must cover"):
        load_multimodal_quality_suite(
            REPOSITORY_ROOT,
            write_payload(tmp_path / "golden.json", payload),
            FAILURE_PATH,
        )


def test_multimodal_quality_suite_rejects_refusal_modality_outside_selected_scope(tmp_path: Path) -> None:
    payload = load_payload(GOLDEN_PATH)
    refusal = next(case for case in payload["cases"] if case["id"] == "answer-refuse-mixed")
    refusal["scope"]["selectedFixtureIds"] = ["pdf-coordinate"]

    with pytest.raises(QualityDataError, match="does not match its scope"):
        load_multimodal_quality_suite(
            REPOSITORY_ROOT,
            write_payload(tmp_path / "golden.json", payload),
            FAILURE_PATH,
        )


@pytest.mark.parametrize(
    ("case_id", "field", "value", "message"),
    [
        ("answer-refuse-pdf", "expectedAnswerPoints", ["Invented answer"], "must not invent"),
        ("evidence-pdf-table-cell", "expectedAnswerPoints", ["91.4"], "must not encode answer claims"),
    ],
)
def test_multimodal_quality_suite_keeps_layer_semantics_strict(
    tmp_path: Path,
    case_id: str,
    field: str,
    value: list[str],
    message: str,
) -> None:
    payload = deepcopy(load_payload(GOLDEN_PATH))
    case = next(item for item in payload["cases"] if item["id"] == case_id)
    case[field] = value

    with pytest.raises(QualityDataError, match=message):
        load_multimodal_quality_suite(
            REPOSITORY_ROOT,
            write_payload(tmp_path / f"{case_id}.json", payload),
            FAILURE_PATH,
        )
