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
    citation_page_accuracy: str = "not_applicable",
    opened_citations: str = "",
    saved_note: str = "no",
    unsupported_claims: str = "",
    region_gap: str = "none",
) -> dict[str, str]:
    started_at = datetime(2026, 7, 17, 8, 0, tzinfo=UTC)
    completed_at = started_at + timedelta(seconds=duration_seconds)
    return {
        "participant_id": participant_id,
        "document_set": f"set-{task_id}",
        "task_id": task_id,
        "task_type": task_type,
        "question": "What does the document say?",
        "expected_answer_points": "One supported point",
        "expected_evidence_pages": "2",
        "workflow": workflow,
        "started_at": started_at.isoformat(),
        "completed_at": completed_at.isoformat(),
        "answer": "A recorded answer",
        "opened_citations": opened_citations,
        "saved_note": saved_note,
        "supported_conclusion": supported_conclusion,
        "citation_page_accuracy": citation_page_accuracy,
        "unsupported_claims": unsupported_claims,
        "region_gap": region_gap,
        "observer_notes": "",
    }


def _write_csv(path, rows: list[dict[str, str]], columns=CSV_COLUMNS) -> None:
    with path.open("w", encoding="utf-8", newline="") as target:
        writer = csv.DictWriter(target, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)


def test_summary_reports_workflow_quality_time_and_region_metrics(tmp_path) -> None:
    dataset = tmp_path / "results.csv"
    _write_csv(
        dataset,
        [
            _row("p1", "t1", "manual", 120),
            _row("p1", "t2", "ai_pdf_workspace", 60, citation_page_accuracy="pass", opened_citations="2"),
            _row("p1", "t3", "manual", 180, task_type="table"),
            _row(
                "p1",
                "t4",
                "ai_pdf_workspace",
                120,
                task_type="table",
                citation_page_accuracy="fail",
                saved_note="yes",
                region_gap="table",
            ),
            _row("p2", "t5", "manual", 240, task_type="no_answer"),
            _row(
                "p2",
                "t6",
                "ai_pdf_workspace",
                180,
                task_type="no_answer",
                region_gap="chart",
            ),
        ],
    )

    report = summarize_user_task_results(load_user_task_results(dataset))

    assert report["recordCount"] == 6
    assert report["participantCount"] == 2
    assert report["workflows"]["manual"]["medianDurationSeconds"] == 180.0
    assert report["workflows"]["ai_pdf_workspace"]["medianDurationSeconds"] == 120.0
    assert report["comparison"]["medianDurationReductionRate"] == 0.333333
    assert report["comparison"]["pairedParticipantCount"] == 2
    assert report["comparison"]["medianParticipantDurationReductionRate"] == 0.325
    ai_summary = report["workflows"]["ai_pdf_workspace"]
    assert ai_summary["citationPageAccuracyRate"] == 0.5
    assert ai_summary["citationOpenRate"] == 0.5
    assert ai_summary["savedNoteRate"] == 0.333333
    assert ai_summary["correctRefusalRate"] == 1.0
    assert ai_summary["fabricatedNoAnswerCount"] == 0
    assert ai_summary["regionGapBreakdown"] == {"chart": 1, "table": 1}


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

    results = load_user_task_results(dataset)

    assert len(results) == 1


@pytest.mark.parametrize(
    ("column", "invalid_value"),
    [
        ("task_type", "fact"),
        ("workflow", "ai"),
        ("saved_note", "true"),
        ("supported_conclusion", "yes"),
        ("citation_page_accuracy", "unknown"),
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


def test_analysis_cli_writes_the_report_it_prints(tmp_path) -> None:
    dataset = tmp_path / "results.csv"
    output = tmp_path / "report.json"
    _write_csv(
        dataset,
        [
            _row("p1", "t1", "manual", 120),
            _row("p1", "t2", "ai_pdf_workspace", 60),
        ],
    )
    script = Path(__file__).resolve().parents[1] / "scripts" / "analyze_user_task_results.py"

    completed = subprocess.run(
        [sys.executable, str(script), "--dataset", str(dataset), "--output", str(output)],
        check=True,
        capture_output=True,
        text=True,
    )

    printed_report = json.loads(completed.stdout)
    written_report = json.loads(output.read_text(encoding="utf-8"))
    assert printed_report == written_report
    assert printed_report["comparison"]["medianDurationReductionRate"] == 0.5
    assert printed_report["automatedGateChecks"]["aiCitationPageAccuracyRate"]["status"] == "not_evaluable"
    assert printed_report["automatedGateChecks"]["aiNoAnswerFabrications"]["status"] == "not_evaluable"
