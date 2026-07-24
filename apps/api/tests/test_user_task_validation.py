import csv
import json
import subprocess
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from ai_pdf_api.services.user_task_validation import (
    CSV_COLUMNS,
    UserTaskValidationDataError,
    load_user_task_manifest,
    load_user_task_results,
    summarize_user_task_results,
)


def _row(
    participant_id: str,
    task_id: str,
    workflow: str,
    duration_seconds: int,
    *,
    task_type: str = "exact_fact",
    supported_conclusion: str = "pass",
    citation_locator_accuracy: str = "pass",
    opened_citations: str = "citation-1",
    saved_note: str = "no",
    unsupported_claims: str = "",
    region_gap: str = "none",
) -> dict[str, str]:
    started_at = datetime(2026, 7, 17, 8, 0, tzinfo=UTC)
    completed_at = started_at + timedelta(seconds=duration_seconds)
    return {
        "participant_id": participant_id,
        "asset_set": "observed-session-assets",
        "task_id": task_id,
        "task_type": task_type,
        "question": "What does the asset evidence say?",
        "expected_answer_points": "One supported point",
        "expected_evidence_locations": "evidence-1",
        "workflow": workflow,
        "started_at": started_at.isoformat(),
        "completed_at": completed_at.isoformat(),
        "answer": "A recorded answer",
        "opened_citations": opened_citations,
        "saved_note": saved_note,
        "supported_conclusion": supported_conclusion,
        "citation_locator_accuracy": citation_locator_accuracy,
        "unsupported_claims": unsupported_claims,
        "region_gap": region_gap,
        "observer_notes": "",
    }


def _participant(
    participant_id: str,
    *,
    kind: str = "target_user",
    target_profile_confirmed: bool = True,
) -> dict[str, object]:
    return {
        "participantId": participant_id,
        "kind": kind,
        "targetProfileConfirmed": target_profile_confirmed,
        "qualificationEvidenceId": f"participant-review-{participant_id}",
    }


def _asset(
    asset_id: str,
    modality: str,
    *,
    origin: str = "real_project",
    complexity_confirmed: bool = True,
) -> dict[str, object]:
    return {
        "assetId": asset_id,
        "modality": modality,
        "origin": origin,
        "complexityConfirmed": complexity_confirmed,
        "qualificationEvidenceId": f"asset-review-{asset_id}",
        "sourceGroup": f"source-{asset_id}",
        "layoutGroup": f"layout-{asset_id}",
    }


def _task(
    task_id: str,
    task_type: str,
    asset_ids: list[str],
    *,
    origin: str = "real_project",
    scoreable: bool = True,
) -> dict[str, object]:
    return {
        "taskId": task_id,
        "taskType": task_type,
        "origin": origin,
        "scoreable": scoreable,
        "assetIds": asset_ids,
        "qualificationEvidenceId": f"task-review-{task_id}",
    }


def _empty_manifest() -> dict[str, object]:
    return {
        "schemaVersion": "user-task-validation-manifest-v1",
        "participants": [],
        "assets": [],
        "tasks": [],
    }


def _evaluable_fixture() -> tuple[dict[str, object], list[dict[str, str]]]:
    participants = [_participant(f"p{index}") for index in range(1, 6)]
    assets = [
        _asset("pdf-1", "pdf"),
        _asset("pdf-2", "pdf"),
        _asset("pdf-3", "pdf"),
        _asset("image-1", "image"),
        _asset("image-2", "image"),
    ]
    task_types = [
        "table",
        "chart",
        "no_answer",
        "no_answer",
        "exact_fact",
        "cross_document_compare",
        "method_constraints",
        "image",
        "exact_fact",
        "cross_document_compare",
        "method_constraints",
        "image",
        "exact_fact",
        "cross_document_compare",
        "method_constraints",
        "image",
        "exact_fact",
        "cross_document_compare",
        "method_constraints",
        "image",
    ]
    tasks: list[dict[str, object]] = []
    rows: list[dict[str, str]] = []
    asset_ids = ["pdf-1", "pdf-2", "pdf-3", "image-1", "image-2"]
    for index, task_type in enumerate(task_types):
        task_id = f"t{index + 1}"
        tasks.append(_task(task_id, task_type, [asset_ids[index % len(asset_ids)]]))
        workflow = "manual" if index % 2 == 0 else "ai_pdf_workspace"
        rows.append(
            _row(
                f"p{index % 5 + 1}",
                task_id,
                workflow,
                120 if workflow == "manual" else 60,
                task_type=task_type,
                citation_locator_accuracy=(
                    "not_applicable" if task_type == "no_answer" else "pass"
                ),
                opened_citations="" if task_type == "no_answer" else "citation-1",
                region_gap=("table" if index in {1, 5, 7} else "none"),
            )
        )
    return {
        "schemaVersion": "user-task-validation-manifest-v1",
        "participants": participants,
        "assets": assets,
        "tasks": tasks,
    }, rows


def _write_csv(path: Path, rows: list[dict[str, str]], columns=CSV_COLUMNS) -> None:
    with path.open("w", encoding="utf-8", newline="") as target:
        writer = csv.DictWriter(target, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)


def _write_manifest(path: Path, manifest: dict[str, object]) -> None:
    path.write_text(json.dumps(manifest), encoding="utf-8")


def _load_report(
    tmp_path: Path, manifest: dict[str, object], rows: list[dict[str, str]]
) -> dict[str, object]:
    dataset_path = tmp_path / "results.csv"
    manifest_path = tmp_path / "manifest.json"
    _write_csv(dataset_path, rows)
    _write_manifest(manifest_path, manifest)
    return summarize_user_task_results(
        load_user_task_results(dataset_path), load_user_task_manifest(manifest_path)
    )


def test_empty_manifest_and_header_only_csv_are_not_evaluable(tmp_path) -> None:
    report = _load_report(tmp_path, _empty_manifest(), [])

    assert report["status"] == "not_evaluable"
    assert report["userValueValidated"] is False
    assert report["productStage"] == "internal_preview"
    assert report["recordCount"] == 0
    assert report["evaluationReadiness"]["eligibleParticipantCount"] == 0
    assert report["evaluationReadiness"]["eligibleTaskCompletionCount"] == 0
    assert all(
        check["status"] == "not_evaluable"
        for check in report["automatedGateChecks"].values()
    )


def test_quality_metrics_stay_not_evaluable_before_all_readiness_thresholds(tmp_path) -> None:
    manifest, rows = _evaluable_fixture()
    manifest["participants"] = manifest["participants"][:4]
    rows = [row for row in rows if row["participant_id"] != "p5"]

    report = _load_report(tmp_path, manifest, rows)

    assert report["status"] == "not_evaluable"
    assert report["evaluationReadiness"]["eligibleParticipantCount"] == 4
    assert report["automatedGateChecks"]["aiSupportedConclusionRate"]["observed"] == 1.0
    assert report["automatedGateChecks"]["aiSupportedConclusionRate"]["status"] == "not_evaluable"


def test_developer_synthetic_and_model_participants_never_count_as_target_users(tmp_path) -> None:
    manifest, rows = _evaluable_fixture()
    manifest["participants"][0] = _participant(
        "p1", kind="developer_self_test", target_profile_confirmed=False
    )
    manifest["participants"][1] = _participant(
        "p2", kind="synthetic_user", target_profile_confirmed=False
    )
    manifest["participants"][2] = _participant(
        "p3", kind="model_agent", target_profile_confirmed=False
    )

    report = _load_report(tmp_path, manifest, rows)

    assert report["evaluationReadiness"]["eligibleParticipantCount"] == 2
    assert report["status"] == "not_evaluable"


def test_duplicate_workflows_count_once_per_participant_and_task(tmp_path) -> None:
    manifest, rows = _evaluable_fixture()
    first = rows[0].copy()
    first["workflow"] = "ai_pdf_workspace"
    rows.append(first)

    report = _load_report(tmp_path, manifest, rows)

    assert report["recordCount"] == 21
    assert report["evaluationReadiness"]["eligibleTaskCompletionCount"] == 20


def test_nineteen_qualified_task_completions_are_not_evaluable(tmp_path) -> None:
    manifest, rows = _evaluable_fixture()
    manifest["tasks"] = manifest["tasks"][:19]
    rows = rows[:19]

    report = _load_report(tmp_path, manifest, rows)

    assert report["evaluationReadiness"]["eligibleTaskCompletionCount"] == 19
    assert report["status"] == "not_evaluable"


def test_synthetic_task_does_not_count_as_qualified_completion(tmp_path) -> None:
    manifest, rows = _evaluable_fixture()
    manifest["tasks"][0]["origin"] = "synthetic"
    manifest["tasks"][0]["scoreable"] = False

    report = _load_report(tmp_path, manifest, rows)

    assert report["evaluationReadiness"]["eligibleTaskCompletionCount"] == 19
    assert report["status"] == "not_evaluable"


def test_real_task_that_references_synthetic_asset_does_not_count(tmp_path) -> None:
    manifest, rows = _evaluable_fixture()
    manifest["assets"].append(
        _asset(
            "synthetic-asset",
            "pdf",
            origin="synthetic",
            complexity_confirmed=False,
        )
    )
    manifest["tasks"][0]["assetIds"] = ["synthetic-asset"]

    report = _load_report(tmp_path, manifest, rows)

    assert report["evaluationReadiness"]["eligibleTaskCompletionCount"] == 19
    assert report["status"] == "not_evaluable"


@pytest.mark.parametrize(
    ("field", "value"),
    [("origin", "synthetic"), ("complexityConfirmed", False)],
)
def test_unqualified_assets_do_not_count(tmp_path, field, value) -> None:
    manifest, rows = _evaluable_fixture()
    manifest["assets"][4][field] = value
    if field == "origin":
        manifest["assets"][4]["complexityConfirmed"] = False

    report = _load_report(tmp_path, manifest, rows)

    assert report["evaluationReadiness"]["eligibleComplexAssetCount"] == 4
    assert report["evaluationReadiness"]["eligibleComplexImageAssetCount"] == 1
    assert report["status"] == "not_evaluable"


def test_unreferenced_complex_asset_does_not_count(tmp_path) -> None:
    manifest, rows = _evaluable_fixture()
    manifest["assets"].append(_asset("unused-image", "image"))
    for task in manifest["tasks"]:
        if task["assetIds"] == ["image-2"]:
            task["assetIds"] = ["image-1"]

    report = _load_report(tmp_path, manifest, rows)

    assert report["evaluationReadiness"]["eligibleComplexImageAssetCount"] == 1
    assert report["status"] == "not_evaluable"


@pytest.mark.parametrize("group_field", ["sourceGroup", "layoutGroup"])
def test_complex_assets_must_not_all_share_one_source_or_layout_group(
    tmp_path, group_field
) -> None:
    manifest, rows = _evaluable_fixture()
    for asset in manifest["assets"]:
        asset[group_field] = "one-group"

    report = _load_report(tmp_path, manifest, rows)

    check_name = "minimumSourceGroups" if group_field == "sourceGroup" else "minimumLayoutGroups"
    assert report["evaluationReadiness"]["checks"][check_name]["status"] == "not_evaluable"
    assert report["status"] == "not_evaluable"


def test_exact_readiness_thresholds_allow_quality_gate_pass(tmp_path) -> None:
    manifest, rows = _evaluable_fixture()

    report = _load_report(tmp_path, manifest, rows)

    assert report["evaluationReadiness"] == {
        "status": "evaluable",
        "eligibleParticipantCount": 5,
        "eligibleTaskCompletionCount": 20,
        "eligibleComplexAssetCount": 5,
        "eligibleComplexPdfAssetCount": 3,
        "eligibleComplexImageAssetCount": 2,
        "eligibleSourceGroupCount": 5,
        "eligibleLayoutGroupCount": 5,
        "checks": {
            "minimumTargetUsers": {"observed": 5, "targetMinimum": 5, "status": "pass"},
            "minimumQualifiedTaskCompletions": {
                "observed": 20,
                "targetMinimum": 20,
                "status": "pass",
            },
            "minimumComplexPdfAssets": {
                "observed": 3,
                "targetMinimum": 3,
                "status": "pass",
            },
            "minimumComplexImageAssets": {
                "observed": 2,
                "targetMinimum": 2,
                "status": "pass",
            },
            "minimumSourceGroups": {
                "observed": 5,
                "targetMinimum": 2,
                "status": "pass",
            },
            "minimumLayoutGroups": {
                "observed": 5,
                "targetMinimum": 2,
                "status": "pass",
            },
        },
        "reasons": [],
    }
    assert report["status"] == "pass"
    assert report["userValueValidated"] is False
    assert report["productStage"] == "internal_preview"
    assert all(check["status"] == "pass" for check in report["automatedGateChecks"].values())


def test_evaluable_quality_failure_keeps_internal_preview(tmp_path) -> None:
    manifest, rows = _evaluable_fixture()
    ai_no_answer = next(
        row
        for row in rows
        if row["workflow"] == "ai_pdf_workspace" and row["task_type"] == "no_answer"
    )
    ai_no_answer["unsupported_claims"] = "Fabricated claim"

    report = _load_report(tmp_path, manifest, rows)

    assert report["evaluationReadiness"]["status"] == "evaluable"
    assert report["automatedGateChecks"]["aiNoAnswerFabrications"]["status"] == "fail"
    assert report["status"] == "fail"
    assert report["userValueValidated"] is False
    assert report["productStage"] == "internal_preview"


def test_loader_requires_exact_template_header(tmp_path) -> None:
    dataset = tmp_path / "results.csv"
    _write_csv(dataset, [], columns=CSV_COLUMNS[:-1])

    with pytest.raises(UserTaskValidationDataError, match="18-column template"):
        load_user_task_results(dataset)


def test_loader_requires_exact_row_width(tmp_path) -> None:
    dataset = tmp_path / "results.csv"
    row = _row("p1", "t1", "manual", 60)
    with dataset.open("w", encoding="utf-8", newline="") as target:
        writer = csv.writer(target)
        writer.writerow(CSV_COLUMNS)
        writer.writerow([row[column] for column in CSV_COLUMNS] + ["unexpected"])

    with pytest.raises(UserTaskValidationDataError, match="exactly 18 fields"):
        load_user_task_results(dataset)


def test_loader_preserves_quoted_delimiters_and_newlines(tmp_path) -> None:
    dataset = tmp_path / "results.csv"
    row = _row("p1", "t1", "manual", 60)
    row["question"] = "Compare A, B, and C."
    row["answer"] = "First line, with a comma.\nSecond line."
    _write_csv(dataset, [row])

    assert len(load_user_task_results(dataset)) == 1


@pytest.mark.parametrize(
    ("column", "invalid_value"),
    [
        ("task_type", "fact"),
        ("workflow", "ai"),
        ("saved_note", "true"),
        ("supported_conclusion", "yes"),
        ("citation_locator_accuracy", "unknown"),
        ("region_gap", "page"),
    ],
)
def test_loader_rejects_noncanonical_values(tmp_path, column, invalid_value) -> None:
    dataset = tmp_path / "results.csv"
    row = _row("p1", "t1", "ai_pdf_workspace", 60)
    row[column] = invalid_value
    _write_csv(dataset, [row])

    with pytest.raises(UserTaskValidationDataError, match=f"Invalid {column}"):
        load_user_task_results(dataset)


def test_loader_rejects_duplicate_task_execution(tmp_path) -> None:
    dataset = tmp_path / "results.csv"
    row = _row("p1", "t1", "manual", 60)
    _write_csv(dataset, [row, row])

    with pytest.raises(UserTaskValidationDataError, match="Duplicate participant/task/workflow"):
        load_user_task_results(dataset)


def test_loader_requires_ordered_timezone_aware_timestamps(tmp_path) -> None:
    dataset = tmp_path / "results.csv"
    row = _row("p1", "t1", "manual", 60)
    row["started_at"] = "2026-07-17T08:00:00"
    _write_csv(dataset, [row])

    with pytest.raises(UserTaskValidationDataError, match="must include a UTC offset"):
        load_user_task_results(dataset)

    row = _row("p1", "t1", "manual", 60)
    row["completed_at"] = row["started_at"]
    _write_csv(dataset, [row])

    with pytest.raises(UserTaskValidationDataError, match="must be later"):
        load_user_task_results(dataset)


@pytest.mark.parametrize(
    "mutation,match",
    [
        (lambda manifest: manifest.update({"unexpected": True}), "exactly the documented fields"),
        (
            lambda manifest: manifest["participants"].extend(
                [_participant("p1"), _participant("p1")]
            ),
            "Duplicate manifest participantId",
        ),
        (
            lambda manifest: manifest["tasks"].append(
                _task("t1", "exact_fact", ["missing-asset"])
            ),
            "references unknown assetIds",
        ),
    ],
)
def test_manifest_validation_fails_closed(tmp_path, mutation, match) -> None:
    manifest = _empty_manifest()
    mutation(manifest)
    path = tmp_path / "manifest.json"
    _write_manifest(path, manifest)

    with pytest.raises(UserTaskValidationDataError, match=match):
        load_user_task_manifest(path)


def test_result_references_and_task_type_must_match_manifest(tmp_path) -> None:
    manifest, rows = _evaluable_fixture()
    rows[0]["task_type"] = "image"

    with pytest.raises(UserTaskValidationDataError, match="does not match"):
        _load_report(tmp_path, manifest, rows)


def _run_cli(
    tmp_path: Path, manifest: dict[str, object], rows: list[dict[str, str]]
) -> tuple[subprocess.CompletedProcess[str], Path]:
    dataset_path = tmp_path / "results.csv"
    manifest_path = tmp_path / "manifest.json"
    output_path = tmp_path / "report.json"
    _write_csv(dataset_path, rows)
    _write_manifest(manifest_path, manifest)
    script = Path(__file__).resolve().parents[1] / "scripts" / "analyze_user_task_results.py"
    completed = subprocess.run(
        [
            sys.executable,
            str(script),
            "--dataset",
            str(dataset_path),
            "--manifest",
            str(manifest_path),
            "--output",
            str(output_path),
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    return completed, output_path


@pytest.mark.parametrize(
    ("expected_status", "expected_exit_code"),
    [("pass", 0), ("fail", 1), ("not_evaluable", 2), ("invalid", 3)],
)
def test_cli_status_exit_codes_and_report_output(
    tmp_path, expected_status, expected_exit_code
) -> None:
    manifest, rows = _evaluable_fixture()
    if expected_status == "fail":
        ai_no_answer = next(
            row
            for row in rows
            if row["workflow"] == "ai_pdf_workspace" and row["task_type"] == "no_answer"
        )
        ai_no_answer["unsupported_claims"] = "Fabricated claim"
    elif expected_status == "not_evaluable":
        manifest, rows = _empty_manifest(), []
    elif expected_status == "invalid":
        manifest["unexpected"] = True

    completed, output_path = _run_cli(tmp_path, manifest, rows)
    printed_report = json.loads(completed.stdout)

    assert completed.returncode == expected_exit_code
    assert printed_report["status"] == expected_status
    assert printed_report["userValueValidated"] is False
    assert printed_report["productStage"] == "internal_preview"
    assert json.loads(output_path.read_text(encoding="utf-8")) == printed_report
