from __future__ import annotations

import csv
import json
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from statistics import median
from typing import Any, Literal


CSV_COLUMNS = (
    "participant_id",
    "asset_set",
    "task_id",
    "task_type",
    "question",
    "expected_answer_points",
    "expected_evidence_locations",
    "workflow",
    "started_at",
    "completed_at",
    "answer",
    "opened_citations",
    "saved_note",
    "supported_conclusion",
    "citation_locator_accuracy",
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
        "image",
        "no_answer",
    }
)
WORKFLOWS = ("manual", "ai_pdf_workspace")
REGION_GAPS = frozenset({"none", "table", "chart", "image", "scan", "other"})
PARTICIPANT_KINDS = frozenset(
    {"target_user", "developer_self_test", "synthetic_user", "model_agent"}
)
ASSET_ORIGINS = frozenset({"real_project", "synthetic", "demo"})
TASK_ORIGINS = frozenset({"real_project", "synthetic", "demo"})
ASSET_MODALITIES = frozenset({"pdf", "image"})

MANIFEST_KEYS = frozenset({"schemaVersion", "participants", "assets", "tasks"})
PARTICIPANT_KEYS = frozenset(
    {
        "participantId",
        "kind",
        "targetProfileConfirmed",
        "qualificationEvidenceId",
    }
)
ASSET_KEYS = frozenset(
    {
        "assetId",
        "modality",
        "origin",
        "complexityConfirmed",
        "qualificationEvidenceId",
        "sourceGroup",
        "layoutGroup",
    }
)
TASK_KEYS = frozenset(
    {
        "taskId",
        "taskType",
        "origin",
        "scoreable",
        "assetIds",
        "qualificationEvidenceId",
    }
)


class UserTaskValidationDataError(ValueError):
    pass


@dataclass(frozen=True)
class UserTaskResult:
    participant_id: str
    asset_set: str
    task_id: str
    task_type: str
    workflow: str
    started_at: datetime
    completed_at: datetime
    opened_citations: str
    saved_note: bool
    supported_conclusion: bool
    citation_locator_accuracy: Literal["pass", "fail", "not_applicable"]
    unsupported_claims: str
    region_gap: str

    @property
    def duration_seconds(self) -> float:
        return (self.completed_at - self.started_at).total_seconds()


@dataclass(frozen=True)
class ParticipantQualification:
    participant_id: str
    kind: str
    target_profile_confirmed: bool
    qualification_evidence_id: str

    @property
    def eligible(self) -> bool:
        return self.kind == "target_user" and self.target_profile_confirmed


@dataclass(frozen=True)
class AssetQualification:
    asset_id: str
    modality: str
    origin: str
    complexity_confirmed: bool
    qualification_evidence_id: str
    source_group: str
    layout_group: str

    @property
    def eligible(self) -> bool:
        return self.origin == "real_project" and self.complexity_confirmed


@dataclass(frozen=True)
class TaskQualification:
    task_id: str
    task_type: str
    origin: str
    scoreable: bool
    asset_ids: tuple[str, ...]
    qualification_evidence_id: str

    @property
    def eligible(self) -> bool:
        return self.origin == "real_project" and self.scoreable


@dataclass(frozen=True)
class UserTaskValidationManifest:
    participants: tuple[ParticipantQualification, ...]
    assets: tuple[AssetQualification, ...]
    tasks: tuple[TaskQualification, ...]


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

    return results


def load_user_task_manifest(path: Path) -> UserTaskValidationManifest:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise UserTaskValidationDataError(
            f"Invalid JSON manifest at {path}:{error.lineno}:{error.colno}: {error.msg}."
        ) from error

    manifest = _object(value, "manifest")
    _exact_keys(manifest, MANIFEST_KEYS, "manifest")
    if manifest["schemaVersion"] != "user-task-validation-manifest-v1":
        raise UserTaskValidationDataError(
            "manifest.schemaVersion must be 'user-task-validation-manifest-v1'."
        )

    participants = tuple(
        _parse_participant(item, index)
        for index, item in enumerate(_array(manifest["participants"], "participants"))
    )
    assets = tuple(
        _parse_asset(item, index)
        for index, item in enumerate(_array(manifest["assets"], "assets"))
    )
    tasks = tuple(
        _parse_task(item, index)
        for index, item in enumerate(_array(manifest["tasks"], "tasks"))
    )

    _unique_ids(
        (participant.participant_id for participant in participants), "participantId"
    )
    asset_ids = _unique_ids((asset.asset_id for asset in assets), "assetId")
    _unique_ids((task.task_id for task in tasks), "taskId")
    for task in tasks:
        missing_asset_ids = sorted(set(task.asset_ids) - asset_ids)
        if missing_asset_ids:
            raise UserTaskValidationDataError(
                f"Task {task.task_id!r} references unknown assetIds: "
                f"{', '.join(missing_asset_ids)}."
            )

    return UserTaskValidationManifest(participants=participants, assets=assets, tasks=tasks)


def summarize_user_task_results(
    results: list[UserTaskResult], manifest: UserTaskValidationManifest
) -> dict[str, Any]:
    participant_by_id = {
        participant.participant_id: participant for participant in manifest.participants
    }
    asset_by_id = {asset.asset_id: asset for asset in manifest.assets}
    task_by_id = {task.task_id: task for task in manifest.tasks}
    _validate_result_references(results, participant_by_id, task_by_id)

    eligible_task_ids = {
        task.task_id
        for task in manifest.tasks
        if task.eligible
        and all(asset_by_id[asset_id].origin == "real_project" for asset_id in task.asset_ids)
    }
    eligible_results = [
        result
        for result in results
        if participant_by_id[result.participant_id].eligible
        and result.task_id in eligible_task_ids
    ]
    eligible_completion_keys = {
        (result.participant_id, result.task_id) for result in eligible_results
    }
    eligible_participant_ids = {
        participant_id for participant_id, _task_id in eligible_completion_keys
    }
    completed_task_ids = {task_id for _participant_id, task_id in eligible_completion_keys}
    used_asset_ids = {
        asset_id
        for task_id in completed_task_ids
        for asset_id in task_by_id[task_id].asset_ids
        if asset_by_id[asset_id].eligible
    }
    eligible_assets = [asset_by_id[asset_id] for asset_id in sorted(used_asset_ids)]
    pdf_asset_count = sum(asset.modality == "pdf" for asset in eligible_assets)
    image_asset_count = sum(asset.modality == "image" for asset in eligible_assets)
    source_group_count = len({asset.source_group for asset in eligible_assets})
    layout_group_count = len({asset.layout_group for asset in eligible_assets})

    readiness_checks = {
        "minimumTargetUsers": _readiness_check(len(eligible_participant_ids), 5),
        "minimumQualifiedTaskCompletions": _readiness_check(
            len(eligible_completion_keys), 20
        ),
        "minimumComplexPdfAssets": _readiness_check(pdf_asset_count, 3),
        "minimumComplexImageAssets": _readiness_check(image_asset_count, 2),
        "minimumSourceGroups": _readiness_check(source_group_count, 2),
        "minimumLayoutGroups": _readiness_check(layout_group_count, 2),
    }
    evaluable = all(check["status"] == "pass" for check in readiness_checks.values())
    readiness_reasons = [
        name for name, check in readiness_checks.items() if check["status"] != "pass"
    ]

    workflows = {
        workflow: _summarize_workflow(
            [result for result in eligible_results if result.workflow == workflow]
        )
        for workflow in WORKFLOWS
    }
    manual_median = workflows["manual"]["medianDurationSeconds"]
    ai_median = workflows["ai_pdf_workspace"]["medianDurationSeconds"]
    median_reduction = _reduction_rate(manual_median, ai_median)
    paired_reductions = _participant_time_reductions(eligible_results)
    ai_summary = workflows["ai_pdf_workspace"]
    unique_completion_results = _unique_completion_results(eligible_results)

    automated_checks = {
        "minimumTableOrChartTasks": _threshold_check(
            sum(result.task_type in {"table", "chart"} for result in unique_completion_results),
            2,
            evaluable=evaluable,
        ),
        "minimumNoAnswerTasks": _threshold_check(
            sum(result.task_type == "no_answer" for result in unique_completion_results),
            2,
            evaluable=evaluable,
        ),
        "aiSupportedConclusionRate": _rate_check(
            ai_summary["supportedConclusionRate"], 0.8, evaluable=evaluable
        ),
        "aiCitationLocatorAccuracyRate": _rate_check(
            ai_summary["citationLocatorAccuracyRate"], 0.9, evaluable=evaluable
        ),
        "aiNoAnswerFabrications": _maximum_check(
            ai_summary["fabricatedNoAnswerCount"],
            0,
            evaluable=evaluable and ai_summary["noAnswerTaskCount"] > 0,
        ),
        "medianDurationReductionRate": _rate_check(
            median_reduction, 0.25, evaluable=evaluable
        ),
        "minimumRegionGapTasks": _threshold_check(
            ai_summary["regionGapCount"], 3, evaluable=evaluable
        ),
    }

    if not evaluable:
        status = "not_evaluable"
    elif all(check["status"] == "pass" for check in automated_checks.values()):
        status = "pass"
    else:
        status = "fail"

    return {
        "schemaVersion": "user-task-validation-v2",
        "status": status,
        "userValueValidated": False,
        "productStage": "internal_preview",
        "recordCount": len(results),
        "qualifiedRecordCount": len(eligible_results),
        "participantCount": len({result.participant_id for result in results}),
        "taskTypeCounts": dict(
            sorted(Counter(result.task_type for result in eligible_results).items())
        ),
        "evaluationReadiness": {
            "status": "evaluable" if evaluable else "not_evaluable",
            "eligibleParticipantCount": len(eligible_participant_ids),
            "eligibleTaskCompletionCount": len(eligible_completion_keys),
            "eligibleComplexAssetCount": len(eligible_assets),
            "eligibleComplexPdfAssetCount": pdf_asset_count,
            "eligibleComplexImageAssetCount": image_asset_count,
            "eligibleSourceGroupCount": source_group_count,
            "eligibleLayoutGroupCount": layout_group_count,
            "checks": readiness_checks,
            "reasons": readiness_reasons,
        },
        "workflows": workflows,
        "comparison": {
            "medianDurationReductionRate": median_reduction,
            "pairedParticipantCount": len(paired_reductions),
            "medianParticipantDurationReductionRate": (
                _rounded(median(paired_reductions)) if paired_reductions else None
            ),
        },
        "automatedGateChecks": automated_checks,
    }


def _parse_participant(value: Any, index: int) -> ParticipantQualification:
    path = f"participants[{index}]"
    item = _object(value, path)
    _exact_keys(item, PARTICIPANT_KEYS, path)
    participant = ParticipantQualification(
        participant_id=_nonempty_string(item["participantId"], f"{path}.participantId"),
        kind=_enum(item["kind"], PARTICIPANT_KINDS, f"{path}.kind"),
        target_profile_confirmed=_boolean(
            item["targetProfileConfirmed"], f"{path}.targetProfileConfirmed"
        ),
        qualification_evidence_id=_nonempty_string(
            item["qualificationEvidenceId"], f"{path}.qualificationEvidenceId"
        ),
    )
    if participant.kind != "target_user" and participant.target_profile_confirmed:
        raise UserTaskValidationDataError(
            f"{path}.targetProfileConfirmed must be false for {participant.kind!r}."
        )
    return participant


def _parse_asset(value: Any, index: int) -> AssetQualification:
    path = f"assets[{index}]"
    item = _object(value, path)
    _exact_keys(item, ASSET_KEYS, path)
    asset = AssetQualification(
        asset_id=_nonempty_string(item["assetId"], f"{path}.assetId"),
        modality=_enum(item["modality"], ASSET_MODALITIES, f"{path}.modality"),
        origin=_enum(item["origin"], ASSET_ORIGINS, f"{path}.origin"),
        complexity_confirmed=_boolean(
            item["complexityConfirmed"], f"{path}.complexityConfirmed"
        ),
        qualification_evidence_id=_nonempty_string(
            item["qualificationEvidenceId"], f"{path}.qualificationEvidenceId"
        ),
        source_group=_nonempty_string(item["sourceGroup"], f"{path}.sourceGroup"),
        layout_group=_nonempty_string(item["layoutGroup"], f"{path}.layoutGroup"),
    )
    if asset.origin != "real_project" and asset.complexity_confirmed:
        raise UserTaskValidationDataError(
            f"{path}.complexityConfirmed must be false for {asset.origin!r}."
        )
    return asset


def _parse_task(value: Any, index: int) -> TaskQualification:
    path = f"tasks[{index}]"
    item = _object(value, path)
    _exact_keys(item, TASK_KEYS, path)
    asset_ids = tuple(
        _nonempty_string(asset_id, f"{path}.assetIds[{asset_index}]")
        for asset_index, asset_id in enumerate(_array(item["assetIds"], f"{path}.assetIds"))
    )
    if not asset_ids:
        raise UserTaskValidationDataError(f"{path}.assetIds must not be empty.")
    if len(asset_ids) != len(set(asset_ids)):
        raise UserTaskValidationDataError(f"{path}.assetIds must not contain duplicates.")
    task = TaskQualification(
        task_id=_nonempty_string(item["taskId"], f"{path}.taskId"),
        task_type=_enum(item["taskType"], TASK_TYPES, f"{path}.taskType"),
        origin=_enum(item["origin"], TASK_ORIGINS, f"{path}.origin"),
        scoreable=_boolean(item["scoreable"], f"{path}.scoreable"),
        asset_ids=asset_ids,
        qualification_evidence_id=_nonempty_string(
            item["qualificationEvidenceId"], f"{path}.qualificationEvidenceId"
        ),
    )
    if task.origin != "real_project" and task.scoreable:
        raise UserTaskValidationDataError(
            f"{path}.scoreable must be false for {task.origin!r}."
        )
    return task


def _validate_result_references(
    results: list[UserTaskResult],
    participant_by_id: dict[str, ParticipantQualification],
    task_by_id: dict[str, TaskQualification],
) -> None:
    for index, result in enumerate(results, start=2):
        if result.participant_id not in participant_by_id:
            raise UserTaskValidationDataError(
                f"CSV row {index} references unknown participant_id {result.participant_id!r}."
            )
        task = task_by_id.get(result.task_id)
        if task is None:
            raise UserTaskValidationDataError(
                f"CSV row {index} references unknown task_id {result.task_id!r}."
            )
        if result.task_type != task.task_type:
            raise UserTaskValidationDataError(
                f"CSV row {index} task_type {result.task_type!r} does not match "
                f"manifest task {result.task_id!r} type {task.task_type!r}."
            )


def _unique_completion_results(results: list[UserTaskResult]) -> list[UserTaskResult]:
    unique: dict[tuple[str, str], UserTaskResult] = {}
    for result in results:
        unique.setdefault((result.participant_id, result.task_id), result)
    return list(unique.values())


def _parse_row(row: dict[str, str | None], *, path: Path, line_number: int) -> UserTaskResult:
    def value(column: str) -> str:
        return (row.get(column) or "").strip()

    participant_id = _required(value("participant_id"), "participant_id", path, line_number)
    asset_set = _required(value("asset_set"), "asset_set", path, line_number)
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
    citation_locator_accuracy = _choice(
        value("citation_locator_accuracy"),
        "citation_locator_accuracy",
        {"pass", "fail", "not_applicable"},
        path,
        line_number,
    )
    region_gap = _choice(value("region_gap"), "region_gap", REGION_GAPS, path, line_number)

    return UserTaskResult(
        participant_id=participant_id,
        asset_set=asset_set,
        task_id=task_id,
        task_type=task_type,
        workflow=workflow,
        started_at=started_at,
        completed_at=completed_at,
        opened_citations=value("opened_citations"),
        saved_note=saved_note,
        supported_conclusion=supported_conclusion,
        citation_locator_accuracy=citation_locator_accuracy,
        unsupported_claims=value("unsupported_claims"),
        region_gap=region_gap,
    )


def _summarize_workflow(results: list[UserTaskResult]) -> dict[str, Any]:
    task_count = len(results)
    supported_count = sum(result.supported_conclusion for result in results)
    citation_results = [
        result for result in results if result.citation_locator_accuracy != "not_applicable"
    ]
    citation_accurate_count = sum(
        result.citation_locator_accuracy == "pass" for result in citation_results
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
        "citationLocatorAccurateCount": citation_accurate_count,
        "citationLocatorAccuracyRate": _ratio(citation_accurate_count, len(citation_results)),
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


def _object(value: Any, path: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise UserTaskValidationDataError(f"{path} must be a JSON object.")
    return value


def _array(value: Any, path: str) -> list[Any]:
    if not isinstance(value, list):
        raise UserTaskValidationDataError(f"{path} must be a JSON array.")
    return value


def _exact_keys(value: dict[str, Any], expected: frozenset[str], path: str) -> None:
    actual = set(value)
    if actual == expected:
        return
    missing = sorted(expected - actual)
    extra = sorted(actual - expected)
    details: list[str] = []
    if missing:
        details.append(f"missing={','.join(missing)}")
    if extra:
        details.append(f"extra={','.join(extra)}")
    raise UserTaskValidationDataError(
        f"{path} must contain exactly the documented fields ({'; '.join(details)})."
    )


def _nonempty_string(value: Any, path: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise UserTaskValidationDataError(f"{path} must be a non-empty string.")
    return value.strip()


def _boolean(value: Any, path: str) -> bool:
    if not isinstance(value, bool):
        raise UserTaskValidationDataError(f"{path} must be a boolean.")
    return value


def _enum(value: Any, choices: frozenset[str], path: str) -> str:
    if not isinstance(value, str) or value not in choices:
        raise UserTaskValidationDataError(
            f"{path} must be one of {', '.join(sorted(choices))}."
        )
    return value


def _unique_ids(values: Any, name: str) -> set[str]:
    observed: set[str] = set()
    for value in values:
        if value in observed:
            raise UserTaskValidationDataError(f"Duplicate manifest {name}: {value!r}.")
        observed.add(value)
    return observed


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


def _readiness_check(observed: int, target: int) -> dict[str, int | str]:
    return {
        "observed": observed,
        "targetMinimum": target,
        "status": "pass" if observed >= target else "not_evaluable",
    }


def _threshold_check(
    observed: int, target: int, *, evaluable: bool
) -> dict[str, int | str]:
    return {
        "observed": observed,
        "targetMinimum": target,
        "status": (
            "pass" if evaluable and observed >= target else "fail" if evaluable else "not_evaluable"
        ),
    }


def _maximum_check(
    observed: int, target: int, *, evaluable: bool
) -> dict[str, int | str | None]:
    return {
        "observed": observed,
        "targetMaximum": target,
        "status": (
            "pass" if evaluable and observed <= target else "fail" if evaluable else "not_evaluable"
        ),
    }


def _rate_check(
    observed: float | None, target: float, *, evaluable: bool
) -> dict[str, float | str | None]:
    return {
        "observed": observed,
        "targetMinimum": target,
        "status": (
            "pass"
            if evaluable and observed is not None and observed >= target
            else "fail"
            if evaluable
            else "not_evaluable"
        ),
    }
