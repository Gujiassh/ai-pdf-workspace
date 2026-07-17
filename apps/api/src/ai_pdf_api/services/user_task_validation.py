from __future__ import annotations

import csv
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from statistics import median
from typing import Any, Literal


CSV_COLUMNS = (
    "participant_id",
    "document_set",
    "task_id",
    "task_type",
    "question",
    "expected_answer_points",
    "expected_evidence_pages",
    "workflow",
    "started_at",
    "completed_at",
    "answer",
    "opened_citations",
    "saved_note",
    "supported_conclusion",
    "citation_page_accuracy",
    "unsupported_claims",
    "region_gap",
    "observer_notes",
)

TASK_TYPES = frozenset(
    {
        "exact_fact",
        "cross_document_compare",
        "method_constraints",
        "table",
        "chart",
        "no_answer",
    }
)
WORKFLOWS = ("manual", "ai_pdf_workspace")
REGION_GAPS = frozenset({"none", "table", "chart", "image", "scan", "other"})


class UserTaskValidationDataError(ValueError):
    pass


@dataclass(frozen=True)
class UserTaskResult:
    participant_id: str
    document_set: str
    task_id: str
    task_type: str
    workflow: str
    started_at: datetime
    completed_at: datetime
    opened_citations: str
    saved_note: bool
    supported_conclusion: bool
    citation_page_accuracy: Literal["pass", "fail", "not_applicable"]
    unsupported_claims: str
    region_gap: str

    @property
    def duration_seconds(self) -> float:
        return (self.completed_at - self.started_at).total_seconds()


def load_user_task_results(path: Path) -> list[UserTaskResult]:
    with path.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        actual_columns = tuple(reader.fieldnames or ())
        if actual_columns != CSV_COLUMNS:
            missing = sorted(set(CSV_COLUMNS) - set(actual_columns))
            extra = sorted(set(actual_columns) - set(CSV_COLUMNS))
            details: list[str] = []
            if missing:
                details.append(f"missing={','.join(missing)}")
            if extra:
                details.append(f"extra={','.join(extra)}")
            if not missing and not extra:
                details.append("columns are out of order")
            raise UserTaskValidationDataError(
                f"CSV header must match the 18-column template exactly ({'; '.join(details)})."
            )

        results: list[UserTaskResult] = []
        seen_keys: set[tuple[str, str, str]] = set()
        for line_number, row in enumerate(reader, start=2):
            missing_values = [column for column in CSV_COLUMNS if row.get(column) is None]
            if None in row or missing_values:
                raise UserTaskValidationDataError(
                    f"CSV row at {path}:{line_number} must contain exactly 18 fields."
                )
            result = _parse_row(row, path=path, line_number=line_number)
            key = (result.participant_id, result.task_id, result.workflow)
            if key in seen_keys:
                raise UserTaskValidationDataError(
                    f"Duplicate participant/task/workflow at {path}:{line_number}: {key!r}."
                )
            seen_keys.add(key)
            results.append(result)

    if not results:
        raise UserTaskValidationDataError(f"Validation dataset {path} contains no task results.")
    return results


def summarize_user_task_results(results: list[UserTaskResult]) -> dict[str, Any]:
    if not results:
        raise ValueError("results must not be empty")

    workflows = {
        workflow: _summarize_workflow([result for result in results if result.workflow == workflow])
        for workflow in WORKFLOWS
    }
    manual_median = workflows["manual"]["medianDurationSeconds"]
    ai_median = workflows["ai_pdf_workspace"]["medianDurationSeconds"]
    median_reduction = _reduction_rate(manual_median, ai_median)
    paired_reductions = _participant_time_reductions(results)
    ai_summary = workflows["ai_pdf_workspace"]

    return {
        "schemaVersion": "user-task-validation-v1",
        "recordCount": len(results),
        "participantCount": len({result.participant_id for result in results}),
        "documentSetCount": len({result.document_set for result in results}),
        "taskTypeCounts": dict(sorted(Counter(result.task_type for result in results).items())),
        "workflows": workflows,
        "comparison": {
            "medianDurationReductionRate": median_reduction,
            "pairedParticipantCount": len(paired_reductions),
            "medianParticipantDurationReductionRate": (
                _rounded(median(paired_reductions)) if paired_reductions else None
            ),
        },
        "automatedGateChecks": {
            "minimumParticipants": _threshold_check(
                len({result.participant_id for result in results}), 5
            ),
            "minimumTaskRecords": _threshold_check(len(results), 20),
            "minimumVisualTasks": _threshold_check(
                sum(result.task_type in {"table", "chart"} for result in results), 2
            ),
            "minimumNoAnswerTasks": _threshold_check(
                sum(result.task_type == "no_answer" for result in results), 2
            ),
            "aiSupportedConclusionRate": _rate_check(
                ai_summary["supportedConclusionRate"], 0.8
            ),
            "aiCitationPageAccuracyRate": _rate_check(
                ai_summary["citationPageAccuracyRate"], 0.9
            ),
            "aiNoAnswerFabrications": _maximum_check(
                ai_summary["fabricatedNoAnswerCount"],
                0,
                evaluable=ai_summary["noAnswerTaskCount"] > 0,
            ),
            "medianDurationReductionRate": _rate_check(median_reduction, 0.25),
            "minimumRegionGapTasks": _threshold_check(ai_summary["regionGapCount"], 3),
        },
    }


def _parse_row(row: dict[str, str | None], *, path: Path, line_number: int) -> UserTaskResult:
    def value(column: str) -> str:
        return (row.get(column) or "").strip()

    participant_id = _required(value("participant_id"), "participant_id", path, line_number)
    document_set = _required(value("document_set"), "document_set", path, line_number)
    task_id = _required(value("task_id"), "task_id", path, line_number)
    task_type = _choice(value("task_type"), "task_type", TASK_TYPES, path, line_number)
    workflow = _choice(value("workflow"), "workflow", set(WORKFLOWS), path, line_number)
    _required(value("question"), "question", path, line_number)

    started_at = _parse_datetime(value("started_at"), "started_at", path, line_number)
    completed_at = _parse_datetime(value("completed_at"), "completed_at", path, line_number)
    if completed_at <= started_at:
        raise UserTaskValidationDataError(
            f"completed_at must be later than started_at at {path}:{line_number}."
        )

    saved_note = _yes_no(value("saved_note"), "saved_note", path, line_number)
    supported_conclusion = _pass_fail(
        value("supported_conclusion"), "supported_conclusion", path, line_number
    )
    citation_page_accuracy = _choice(
        value("citation_page_accuracy"),
        "citation_page_accuracy",
        {"pass", "fail", "not_applicable"},
        path,
        line_number,
    )
    region_gap = _choice(value("region_gap"), "region_gap", REGION_GAPS, path, line_number)

    return UserTaskResult(
        participant_id=participant_id,
        document_set=document_set,
        task_id=task_id,
        task_type=task_type,
        workflow=workflow,
        started_at=started_at,
        completed_at=completed_at,
        opened_citations=value("opened_citations"),
        saved_note=saved_note,
        supported_conclusion=supported_conclusion,
        citation_page_accuracy=citation_page_accuracy,
        unsupported_claims=value("unsupported_claims"),
        region_gap=region_gap,
    )


def _summarize_workflow(results: list[UserTaskResult]) -> dict[str, Any]:
    task_count = len(results)
    supported_count = sum(result.supported_conclusion for result in results)
    citation_results = [
        result for result in results if result.citation_page_accuracy != "not_applicable"
    ]
    citation_accurate_count = sum(
        result.citation_page_accuracy == "pass" for result in citation_results
    )
    citation_opened_count = sum(bool(result.opened_citations) for result in citation_results)
    note_count = sum(result.saved_note for result in results)
    no_answer_results = [result for result in results if result.task_type == "no_answer"]
    fabricated_no_answer_count = sum(bool(result.unsupported_claims) for result in no_answer_results)
    correct_refusal_count = sum(
        result.supported_conclusion and not result.unsupported_claims
        for result in no_answer_results
    )
    region_gap_results = [result for result in results if result.region_gap != "none"]

    return {
        "taskCount": task_count,
        "supportedConclusionCount": supported_count,
        "supportedConclusionRate": _ratio(supported_count, task_count),
        "medianDurationSeconds": (
            _rounded(median(result.duration_seconds for result in results)) if results else None
        ),
        "citationScoredTaskCount": len(citation_results),
        "citationPageAccurateCount": citation_accurate_count,
        "citationPageAccuracyRate": _ratio(citation_accurate_count, len(citation_results)),
        "citationOpenedCount": citation_opened_count,
        "citationOpenRate": _ratio(citation_opened_count, len(citation_results)),
        "savedNoteCount": note_count,
        "savedNoteRate": _ratio(note_count, task_count),
        "unsupportedClaimTaskCount": sum(bool(result.unsupported_claims) for result in results),
        "noAnswerTaskCount": len(no_answer_results),
        "correctRefusalCount": correct_refusal_count,
        "correctRefusalRate": _ratio(correct_refusal_count, len(no_answer_results)),
        "fabricatedNoAnswerCount": fabricated_no_answer_count,
        "regionGapCount": len(region_gap_results),
        "regionGapRate": _ratio(len(region_gap_results), task_count),
        "regionGapBreakdown": dict(
            sorted(Counter(result.region_gap for result in region_gap_results).items())
        ),
    }


def _participant_time_reductions(results: list[UserTaskResult]) -> list[float]:
    durations: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    for result in results:
        durations[result.participant_id][result.workflow].append(result.duration_seconds)

    reductions: list[float] = []
    for participant_workflows in durations.values():
        manual = participant_workflows.get("manual")
        ai = participant_workflows.get("ai_pdf_workspace")
        if not manual or not ai:
            continue
        reduction = _reduction_rate(median(manual), median(ai))
        if reduction is not None:
            reductions.append(reduction)
    return reductions


def _required(value: str, column: str, path: Path, line_number: int) -> str:
    if not value:
        raise UserTaskValidationDataError(f"{column} is required at {path}:{line_number}.")
    return value


def _choice(
    value: str,
    column: str,
    choices: set[str] | frozenset[str],
    path: Path,
    line_number: int,
) -> str:
    if value not in choices:
        raise UserTaskValidationDataError(
            f"Invalid {column} at {path}:{line_number}: {value!r}; "
            f"expected one of {', '.join(sorted(choices))}."
        )
    return value


def _parse_datetime(value: str, column: str, path: Path, line_number: int) -> datetime:
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError as error:
        raise UserTaskValidationDataError(
            f"Invalid ISO 8601 {column} at {path}:{line_number}: {value!r}."
        ) from error
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise UserTaskValidationDataError(
            f"{column} must include a UTC offset at {path}:{line_number}."
        )
    return parsed


def _yes_no(value: str, column: str, path: Path, line_number: int) -> bool:
    _choice(value, column, {"yes", "no"}, path, line_number)
    return value == "yes"


def _pass_fail(value: str, column: str, path: Path, line_number: int) -> bool:
    _choice(value, column, {"pass", "fail"}, path, line_number)
    return value == "pass"


def _ratio(numerator: int, denominator: int) -> float | None:
    return _rounded(numerator / denominator) if denominator else None


def _reduction_rate(manual_seconds: float | None, ai_seconds: float | None) -> float | None:
    if manual_seconds is None or ai_seconds is None or manual_seconds <= 0:
        return None
    return _rounded((manual_seconds - ai_seconds) / manual_seconds)


def _rounded(value: float) -> float:
    return round(value, 6)


def _threshold_check(observed: int, target: int) -> dict[str, int | str]:
    return {"observed": observed, "targetMinimum": target, "status": "pass" if observed >= target else "fail"}


def _maximum_check(observed: int, target: int, *, evaluable: bool) -> dict[str, int | str | None]:
    return {
        "observed": observed if evaluable else None,
        "targetMaximum": target,
        "status": "pass" if evaluable and observed <= target else "fail" if evaluable else "not_evaluable",
    }


def _rate_check(observed: float | None, target: float) -> dict[str, float | str | None]:
    return {
        "observed": observed,
        "targetMinimum": target,
        "status": "pass" if observed is not None and observed >= target else "fail" if observed is not None else "not_evaluable",
    }
