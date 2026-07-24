from __future__ import annotations

import ast
import hashlib
import json
import math
from collections import Counter
from pathlib import Path, PurePosixPath
from typing import Literal, get_args

from pydantic import BaseModel, ConfigDict, Field, model_validator

from ai_pdf_api.services.retrieval_eval import EvaluationDataError, load_evaluation_cases


GoldenLayer = Literal["retrieval", "evidence", "answer"]
GoldenModality = Literal["pdf", "image", "mixed"]
GoldenTaskType = Literal[
    "exact_fact",
    "cross_asset_compare",
    "method_constraints",
    "table",
    "chart",
    "image",
    "no_answer",
]
FailureCategory = Literal[
    "asset_parse",
    "retrieval_candidate",
    "rrf_ranking",
    "answer_support",
    "evidence_localization",
    "table_structure",
    "visual_semantics",
    "false_answer",
    "viewer_rendering",
    "workflow",
]

REQUIRED_LAYERS = frozenset({"retrieval", "evidence", "answer"})
REQUIRED_MODALITIES = frozenset({"pdf", "image", "mixed"})
REQUIRED_TASK_TYPES = frozenset(
    {
        "exact_fact",
        "cross_asset_compare",
        "method_constraints",
        "table",
        "chart",
        "image",
        "no_answer",
    }
)
MINIMUM_CASES = 20
MINIMUM_CASES_PER_LAYER = 6
MINIMUM_NO_ANSWER_CASES = 2


class QualityDataError(ValueError):
    pass


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class GoldenFixture(StrictModel):
    id: str = Field(min_length=1)
    modality: Literal["pdf", "image"]
    manifest_kind: Literal["pdf_coordinate_v1", "pdf_artifact_matrix_v1", "image_coordinate_v1"] = Field(
        alias="manifestKind"
    )
    source_path: str = Field(alias="sourcePath", min_length=1)
    manifest_path: str = Field(alias="manifestPath", min_length=1)
    source_sha256: str = Field(alias="sourceSha256", pattern=r"^[0-9a-f]{64}$")
    manifest_sha256: str = Field(alias="manifestSha256", pattern=r"^[0-9a-f]{64}$")


class GoldenReferenceBaseline(StrictModel):
    id: str = Field(min_length=1)
    kind: Literal["retrieval_jsonl"]
    file_path: str = Field(alias="filePath", min_length=1)
    source_sha256: str = Field(alias="sourceSha256", pattern=r"^[0-9a-f]{64}$")
    case_count: int = Field(alias="caseCount", ge=1)
    modalities: list[Literal["pdf", "image"]] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_modalities(self) -> "GoldenReferenceBaseline":
        if len(self.modalities) != len(set(self.modalities)):
            raise ValueError("reference baseline modalities must not contain duplicates")
        return self


class GoldenScope(StrictModel):
    mode: Literal["all_ready", "selected"]
    selected_fixture_ids: list[str] = Field(alias="selectedFixtureIds", default_factory=list)

    @model_validator(mode="after")
    def validate_selection(self) -> "GoldenScope":
        if len(self.selected_fixture_ids) != len(set(self.selected_fixture_ids)):
            raise ValueError("selectedFixtureIds must not contain duplicates")
        if self.mode == "all_ready" and self.selected_fixture_ids:
            raise ValueError("all_ready scope must not contain selectedFixtureIds")
        if self.mode == "selected" and not self.selected_fixture_ids:
            raise ValueError("selected scope must contain selectedFixtureIds")
        return self


class GoldenEvidenceTarget(StrictModel):
    fixture_id: str = Field(alias="fixtureId", min_length=1)
    locator_kind: Literal["pdf_page", "pdf_region", "image_region"] = Field(alias="locatorKind")
    page_number: int | None = Field(alias="pageNumber", default=None, ge=1)
    page_label: str | None = Field(alias="pageLabel", default=None, min_length=1)
    region_indexes: list[int] = Field(alias="regionIndexes", default_factory=list)
    region_labels: list[str] = Field(alias="regionLabels", default_factory=list)

    @model_validator(mode="after")
    def validate_locator_shape(self) -> "GoldenEvidenceTarget":
        if len(self.region_indexes) != len(set(self.region_indexes)) or any(index < 0 for index in self.region_indexes):
            raise ValueError("regionIndexes must contain unique non-negative integers")
        if len(self.region_labels) != len(set(self.region_labels)):
            raise ValueError("regionLabels must not contain duplicates")
        if self.locator_kind == "pdf_page":
            if self.page_number is None or self.page_label is None or self.region_indexes or self.region_labels:
                raise ValueError("pdf_page requires pageNumber/pageLabel and no regions")
        elif self.locator_kind == "pdf_region":
            if self.page_number is None or self.page_label is None or not self.region_indexes or self.region_labels:
                raise ValueError("pdf_region requires pageNumber/pageLabel and regionIndexes")
        elif self.page_number is not None or self.page_label is not None or self.region_indexes or not self.region_labels:
            raise ValueError("image_region requires only regionLabels")
        return self


class GoldenCase(StrictModel):
    id: str = Field(min_length=1)
    layer: GoldenLayer
    modality: GoldenModality
    task_type: GoldenTaskType = Field(alias="taskType")
    question: str = Field(min_length=1)
    scope: GoldenScope
    expected_disposition: Literal["answer", "refuse"] = Field(alias="expectedDisposition")
    expected_answer_points: list[str] = Field(alias="expectedAnswerPoints", default_factory=list)
    evidence_targets: list[GoldenEvidenceTarget] = Field(alias="evidenceTargets", default_factory=list)

    @model_validator(mode="after")
    def validate_expectation(self) -> "GoldenCase":
        if self.expected_disposition == "refuse":
            if self.layer != "answer" or self.task_type != "no_answer":
                raise ValueError("refusal cases must be answer-layer no_answer tasks")
            if self.expected_answer_points or self.evidence_targets:
                raise ValueError("refusal cases must not invent answer points or evidence")
        else:
            if not self.evidence_targets:
                raise ValueError("answerable cases require evidenceTargets")
            if self.layer == "answer" and not self.expected_answer_points:
                raise ValueError("answer-layer cases require expectedAnswerPoints")
            if self.layer != "answer" and self.expected_answer_points:
                raise ValueError("non-answer layers must not encode answer claims")
        return self


class GoldenSet(StrictModel):
    schema_version: Literal["multimodal-golden-v1"] = Field(alias="schemaVersion")
    reference_baselines: list[GoldenReferenceBaseline] = Field(alias="referenceBaselines", min_length=1)
    fixtures: list[GoldenFixture] = Field(min_length=1)
    cases: list[GoldenCase] = Field(min_length=1)


class FailureTaxonomyItem(StrictModel):
    id: FailureCategory
    definition: str = Field(min_length=1)


class FailureReproduction(StrictModel):
    test_file: str = Field(alias="testFile", min_length=1)
    test_name: str = Field(alias="testName", pattern=r"^test_[a-zA-Z0-9_]+$")

    @model_validator(mode="after")
    def validate_test_file(self) -> "FailureReproduction":
        path = PurePosixPath(self.test_file)
        if (
            path.is_absolute()
            or "\\" in self.test_file
            or any(part in {".", ".."} for part in self.test_file.split("/"))
            or path.as_posix() != self.test_file
            or path.suffix != ".py"
        ):
            raise ValueError("testFile must be a canonical relative POSIX Python path")
        return self


class FailureSample(StrictModel):
    id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    category: FailureCategory
    layer: GoldenLayer
    modalities: list[Literal["pdf", "image"]] = Field(min_length=1)
    status: Literal["regression_locked"] = "regression_locked"
    observed_evidence: str = Field(alias="observedEvidence", min_length=1)
    expected_guard: str = Field(alias="expectedGuard", min_length=1)
    reproduction: FailureReproduction

    @model_validator(mode="after")
    def validate_modalities(self) -> "FailureSample":
        if len(self.modalities) != len(set(self.modalities)):
            raise ValueError("failure modalities must not contain duplicates")
        return self


class FailureRegistry(StrictModel):
    schema_version: Literal["multimodal-failures-v1"] = Field(alias="schemaVersion")
    taxonomy: list[FailureTaxonomyItem] = Field(min_length=1)
    samples: list[FailureSample] = Field(min_length=1)


def load_multimodal_quality_suite(
    repository_root: Path,
    golden_path: Path,
    failure_path: Path,
) -> tuple[GoldenSet, FailureRegistry, dict[str, object]]:
    root = repository_root.resolve()
    golden = _load_model(golden_path, GoldenSet)
    failures = _load_model(failure_path, FailureRegistry)
    _validate_unique_ids("fixture", [fixture.id for fixture in golden.fixtures])
    _validate_unique_ids("reference baseline", [baseline.id for baseline in golden.reference_baselines])
    _validate_unique_ids("case", [case.id for case in golden.cases])
    _validate_unique_ids("failure sample", [sample.id for sample in failures.samples])
    _validate_golden_set(root, golden)
    _validate_failure_registry(root, failures)
    return golden, failures, build_quality_report(golden, failures)


def build_quality_report(golden: GoldenSet, failures: FailureRegistry) -> dict[str, object]:
    layers = Counter(case.layer for case in golden.cases)
    modalities = Counter(case.modality for case in golden.cases)
    task_types = Counter(case.task_type for case in golden.cases)
    categories = Counter(sample.category for sample in failures.samples)
    return {
        "schemaVersion": "multimodal-quality-report-v1",
        "goldenSet": {
            "caseCount": len(golden.cases),
            "fixtureCount": len(golden.fixtures),
            "layers": _ordered_counts(layers, ["retrieval", "evidence", "answer"]),
            "modalities": _ordered_counts(modalities, ["pdf", "image", "mixed"]),
            "taskTypes": _ordered_counts(task_types, sorted(REQUIRED_TASK_TYPES)),
            "refusalCaseCount": sum(case.expected_disposition == "refuse" for case in golden.cases),
            "referenceBaselines": {
                baseline.id: {"caseCount": baseline.case_count, "modalities": baseline.modalities}
                for baseline in golden.reference_baselines
            },
        },
        "failureRegistry": {
            "sampleCount": len(failures.samples),
            "regressionLockedCount": sum(sample.status == "regression_locked" for sample in failures.samples),
            "categories": _ordered_counts(categories, [item.id for item in failures.taxonomy]),
            "reproductionArgv": [_failure_reproduction_argv(sample) for sample in failures.samples],
        },
        "coveragePassed": True,
    }


def _load_model(path: Path, model_type: type[StrictModel]):
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return model_type.model_validate(payload)
    except (OSError, json.JSONDecodeError, ValueError) as error:
        raise QualityDataError(f"Invalid quality data {path}: {error}") from error


def _validate_unique_ids(label: str, values: list[str]) -> None:
    duplicates = sorted(value for value, count in Counter(values).items() if count > 1)
    if duplicates:
        raise QualityDataError(f"Duplicate {label} ids: {', '.join(duplicates)}")


def _validate_golden_set(repository_root: Path, golden: GoldenSet) -> None:
    if not golden.reference_baselines:
        raise QualityDataError("Golden set requires at least one reference baseline.")
    for baseline in golden.reference_baselines:
        baseline_path = _repository_file(repository_root, baseline.file_path)
        actual_hash = hashlib.sha256(baseline_path.read_bytes()).hexdigest()
        if actual_hash != baseline.source_sha256:
            raise QualityDataError(
                f"Reference baseline {baseline.id!r} hash mismatch: expected {baseline.source_sha256}, got {actual_hash}."
            )
        if baseline.kind == "retrieval_jsonl":
            _validate_retrieval_jsonl(baseline, baseline_path)

    fixture_by_id = {fixture.id: fixture for fixture in golden.fixtures}
    manifests: dict[str, dict[str, object]] = {}
    for fixture in golden.fixtures:
        source_path = _repository_file(repository_root, fixture.source_path)
        manifest_path = _repository_file(repository_root, fixture.manifest_path)
        actual_hash = hashlib.sha256(source_path.read_bytes()).hexdigest()
        if actual_hash != fixture.source_sha256:
            raise QualityDataError(
                f"Fixture {fixture.id!r} hash mismatch: expected {fixture.source_sha256}, got {actual_hash}."
            )
        actual_manifest_hash = hashlib.sha256(manifest_path.read_bytes()).hexdigest()
        if actual_manifest_hash != fixture.manifest_sha256:
            raise QualityDataError(
                f"Fixture {fixture.id!r} manifest hash mismatch: "
                f"expected {fixture.manifest_sha256}, got {actual_manifest_hash}."
            )
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise QualityDataError(f"Fixture {fixture.id!r} has an invalid manifest.") from error
        if not isinstance(manifest, dict):
            raise QualityDataError(f"Fixture {fixture.id!r} manifest must be an object.")
        _validate_fixture_manifest(fixture, manifest, source_path)
        manifests[fixture.id] = manifest

    for case in golden.cases:
        selected = set(case.scope.selected_fixture_ids)
        unknown_selected = selected - fixture_by_id.keys()
        if unknown_selected:
            raise QualityDataError(f"Case {case.id!r} selects unknown fixtures: {sorted(unknown_selected)}")
        target_modalities: set[str] = set()
        for target in case.evidence_targets:
            fixture = fixture_by_id.get(target.fixture_id)
            if fixture is None:
                raise QualityDataError(f"Case {case.id!r} targets unknown fixture {target.fixture_id!r}.")
            if case.scope.mode == "selected" and target.fixture_id not in selected:
                raise QualityDataError(f"Case {case.id!r} targets fixture outside selected scope.")
            target_modalities.add(fixture.modality)
            _validate_target(case.id, fixture, manifests[target.fixture_id], target)
        if case.expected_disposition == "answer":
            expected_modality = "mixed" if target_modalities == {"pdf", "image"} else next(iter(target_modalities))
            if case.modality != expected_modality:
                raise QualityDataError(
                    f"Case {case.id!r} modality {case.modality!r} does not match targets {sorted(target_modalities)}."
                )
        else:
            scope_fixture_ids = selected if case.scope.mode == "selected" else set(fixture_by_id)
            scope_modalities = {fixture_by_id[fixture_id].modality for fixture_id in scope_fixture_ids}
            expected_modality = "mixed" if scope_modalities == {"pdf", "image"} else next(iter(scope_modalities))
            if case.modality != expected_modality:
                raise QualityDataError(
                    f"Refusal case {case.id!r} modality {case.modality!r} does not match its scope."
                )

    layer_counts = Counter(case.layer for case in golden.cases)
    modalities = {case.modality for case in golden.cases}
    task_types = {case.task_type for case in golden.cases}
    refusal_count = sum(case.expected_disposition == "refuse" for case in golden.cases)
    if len(golden.cases) < MINIMUM_CASES:
        raise QualityDataError(f"Golden set requires at least {MINIMUM_CASES} cases.")
    if set(layer_counts) != REQUIRED_LAYERS or any(layer_counts[layer] < MINIMUM_CASES_PER_LAYER for layer in REQUIRED_LAYERS):
        raise QualityDataError(f"Golden set requires at least {MINIMUM_CASES_PER_LAYER} cases in every layer.")
    for layer in REQUIRED_LAYERS:
        layer_modalities = {case.modality for case in golden.cases if case.layer == layer}
        if layer_modalities != REQUIRED_MODALITIES:
            raise QualityDataError(f"Golden set layer {layer!r} must cover {sorted(REQUIRED_MODALITIES)}.")
    if modalities != REQUIRED_MODALITIES:
        raise QualityDataError(f"Golden set modalities must be {sorted(REQUIRED_MODALITIES)}.")
    if task_types != REQUIRED_TASK_TYPES:
        raise QualityDataError(f"Golden set task types must be {sorted(REQUIRED_TASK_TYPES)}.")
    if refusal_count < MINIMUM_NO_ANSWER_CASES:
        raise QualityDataError(f"Golden set requires at least {MINIMUM_NO_ANSWER_CASES} refusal cases.")


def _validate_target(
    case_id: str,
    fixture: GoldenFixture,
    manifest: dict[str, object],
    target: GoldenEvidenceTarget,
) -> None:
    if fixture.modality == "pdf" and target.locator_kind == "image_region":
        raise QualityDataError(f"Case {case_id!r} uses image locator for PDF fixture.")
    if fixture.modality == "image" and target.locator_kind != "image_region":
        raise QualityDataError(f"Case {case_id!r} uses PDF locator for Image fixture.")
    if fixture.modality == "image":
        raw_regions = manifest.get("regions")
        if not isinstance(raw_regions, list):
            raise QualityDataError(f"Fixture {fixture.id!r} has no regions list.")
        labels = {region.get("label") for region in raw_regions if isinstance(region, dict)}
        missing = set(target.region_labels) - labels
        if missing:
            raise QualityDataError(f"Case {case_id!r} references missing image regions: {sorted(missing)}")
        return

    raw_pages = manifest.get("pages")
    if not isinstance(raw_pages, list):
        raise QualityDataError(f"Fixture {fixture.id!r} has no pages list.")
    page_matches = [page for page in raw_pages if isinstance(page, dict) and page.get("label") == target.page_label]
    if len(page_matches) != 1:
        raise QualityDataError(f"Case {case_id!r} references missing or duplicate page label {target.page_label!r}.")
    page = page_matches[0]
    if page.get("pageNumber") != target.page_number:
        raise QualityDataError(f"Case {case_id!r} pageNumber does not match its manifest page label.")
    raw_regions = page.get("regions")
    if not isinstance(raw_regions, list):
        raise QualityDataError(f"Case {case_id!r} references a page without regions.")
    if any(index >= len(raw_regions) for index in target.region_indexes):
        raise QualityDataError(f"Case {case_id!r} references a missing PDF region index.")


def _validate_failure_registry(repository_root: Path, failures: FailureRegistry) -> None:
    taxonomy_ids = [item.id for item in failures.taxonomy]
    _validate_unique_ids("failure taxonomy", taxonomy_ids)
    expected_taxonomy = set(get_args(FailureCategory))
    if set(taxonomy_ids) != expected_taxonomy:
        raise QualityDataError("Failure taxonomy must define every frozen v1 category exactly once.")
    for sample in failures.samples:
        _failure_reproduction_argv(sample)
        test_path = _repository_file(repository_root, sample.reproduction.test_file)
        try:
            tree = ast.parse(test_path.read_text(encoding="utf-8"), filename=str(test_path))
        except (OSError, SyntaxError) as error:
            raise QualityDataError(f"Failure sample {sample.id!r} test file cannot be parsed.") from error
        test_names = {
            node.name for node in tree.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        }
        if sample.reproduction.test_name not in test_names:
            raise QualityDataError(
                f"Failure sample {sample.id!r} has no persisted regression test {sample.reproduction.test_name!r}."
            )


def _failure_reproduction_argv(sample: FailureSample) -> list[str]:
    test_file = sample.reproduction.test_file
    if test_file.startswith("apps/api/tests/"):
        project = "apps/api"
    elif test_file.startswith("apps/worker/tests/"):
        project = "apps/worker"
    else:
        raise QualityDataError(
            f"Failure sample {sample.id!r} testFile must belong to the API or Worker pytest suite."
        )
    return [
        "uv",
        "run",
        "--project",
        project,
        "pytest",
        f"{test_file}::{sample.reproduction.test_name}",
    ]


def _repository_file(repository_root: Path, relative_path: str) -> Path:
    candidate = (repository_root / relative_path).resolve()
    if candidate == repository_root or repository_root not in candidate.parents:
        raise QualityDataError(f"Path escapes repository root: {relative_path!r}.")
    if not candidate.is_file():
        raise QualityDataError(f"Repository file does not exist: {relative_path!r}.")
    return candidate


def _validate_retrieval_jsonl(baseline: GoldenReferenceBaseline, path: Path) -> None:
    if baseline.modalities != ["pdf"]:
        raise QualityDataError(f"Reference baseline {baseline.id!r} retrieval_jsonl modalities must be ['pdf'].")
    try:
        cases = load_evaluation_cases(path)
    except EvaluationDataError as error:
        raise QualityDataError(f"Reference baseline {baseline.id!r} is invalid: {error}") from error
    if len(cases) != baseline.case_count:
        raise QualityDataError(
            f"Reference baseline {baseline.id!r} expected {baseline.case_count} cases, found {len(cases)}."
        )


def _validate_fixture_manifest(fixture: GoldenFixture, manifest: dict[str, object], source_path: Path) -> None:
    if fixture.manifest_kind == "image_coordinate_v1":
        if fixture.modality != "image":
            raise QualityDataError(f"Fixture {fixture.id!r} image manifest requires image modality.")
        _validate_image_manifest(fixture, manifest, source_path)
        return
    if fixture.modality != "pdf":
        raise QualityDataError(f"Fixture {fixture.id!r} PDF manifest requires pdf modality.")
    if fixture.manifest_kind == "pdf_coordinate_v1":
        _validate_pdf_coordinate_manifest(fixture, manifest)
    else:
        _validate_pdf_artifact_manifest(fixture, manifest)


def _validate_image_manifest(fixture: GoldenFixture, manifest: dict[str, object], source_path: Path) -> None:
    _require_keys(
        manifest,
        {"schemaVersion", "coordinateStatus", "coordinateSpace", "image", "regions"},
        f"Fixture {fixture.id!r} image manifest",
    )
    if manifest["schemaVersion"] != 1 or manifest["coordinateStatus"] != "approved-contract-fixture-v1":
        raise QualityDataError(f"Fixture {fixture.id!r} has an unapproved image manifest version.")
    if manifest["coordinateSpace"] != "image_normalized_top_left_v1":
        raise QualityDataError(f"Fixture {fixture.id!r} has an unsupported image coordinateSpace.")
    image = manifest["image"]
    if not isinstance(image, dict):
        raise QualityDataError(f"Fixture {fixture.id!r} image manifest has no image object.")
    _require_keys(
        image,
        {"filename", "widthPixels", "heightPixels", "orientationApplied", "sha256"},
        f"Fixture {fixture.id!r} image object",
    )
    if image["filename"] != source_path.name or image["sha256"] != fixture.source_sha256:
        raise QualityDataError(f"Fixture {fixture.id!r} image identity does not match its source.")
    if not _positive_int(image["widthPixels"]) or not _positive_int(image["heightPixels"]):
        raise QualityDataError(f"Fixture {fixture.id!r} image dimensions must be positive integers.")
    if image["orientationApplied"] is not True:
        raise QualityDataError(f"Fixture {fixture.id!r} image orientation must be canonical.")
    _validate_regions(manifest["regions"], f"Fixture {fixture.id!r} image", require_labels=True)


def _validate_pdf_coordinate_manifest(fixture: GoldenFixture, manifest: dict[str, object]) -> None:
    _require_keys(
        manifest,
        {"schemaVersion", "coordinateStatus", "coordinateBasis", "pages"},
        f"Fixture {fixture.id!r} PDF coordinate manifest",
    )
    if manifest["schemaVersion"] != 1 or manifest["coordinateStatus"] != "approved-contract-fixture-v1":
        raise QualityDataError(f"Fixture {fixture.id!r} has an unapproved PDF coordinate manifest version.")
    if manifest["coordinateBasis"] != "pdf_crop_box_normalized_top_left_v1":
        raise QualityDataError(f"Fixture {fixture.id!r} has an unsupported PDF coordinate basis.")
    _validate_pdf_pages(fixture, manifest["pages"], artifact_matrix=False)


def _validate_pdf_artifact_manifest(fixture: GoldenFixture, manifest: dict[str, object]) -> None:
    _require_keys(
        manifest,
        {"schemaVersion", "coordinateBasis", "cropBox", "pages"},
        f"Fixture {fixture.id!r} PDF artifact manifest",
    )
    if manifest["schemaVersion"] != 1:
        raise QualityDataError(f"Fixture {fixture.id!r} has an unsupported PDF artifact manifest version.")
    if manifest["coordinateBasis"] != "pdf_crop_box_normalized_top_left_v1":
        raise QualityDataError(f"Fixture {fixture.id!r} has an unsupported PDF coordinate basis.")
    crop_box = _validate_box(manifest["cropBox"], f"Fixture {fixture.id!r} artifact cropBox")
    _validate_pdf_pages(fixture, manifest["pages"], artifact_matrix=True, expected_crop_box=crop_box)


def _validate_pdf_pages(
    fixture: GoldenFixture,
    raw_pages: object,
    *,
    artifact_matrix: bool,
    expected_crop_box: tuple[float, float, float, float] | None = None,
) -> None:
    if not isinstance(raw_pages, list) or not raw_pages:
        raise QualityDataError(f"Fixture {fixture.id!r} PDF manifest must contain pages.")
    labels: set[str] = set()
    page_numbers: set[int] = set()
    common_keys = {
        "label",
        "pageNumber",
        "mediaBoxPoints",
        "cropBoxPoints",
        "rotationDegrees",
        "displayWidthPoints",
        "displayHeightPoints",
        "regions",
    }
    artifact_keys = {"artifactKind", "artifactText", "pixelClass", "sourceRegion"}
    for page in raw_pages:
        if not isinstance(page, dict):
            raise QualityDataError(f"Fixture {fixture.id!r} PDF page must be an object.")
        allowed_keys = common_keys | artifact_keys if artifact_matrix else common_keys | {"artifacts"}
        if set(page) - allowed_keys or not common_keys.issubset(page):
            raise QualityDataError(f"Fixture {fixture.id!r} PDF page has invalid fields.")
        label = page["label"]
        page_number = page["pageNumber"]
        if not isinstance(label, str) or not label or label in labels:
            raise QualityDataError(f"Fixture {fixture.id!r} PDF page labels must be unique and non-empty.")
        if not _positive_int(page_number) or page_number in page_numbers:
            raise QualityDataError(f"Fixture {fixture.id!r} PDF page numbers must be unique and positive.")
        labels.add(label)
        page_numbers.add(page_number)
        media_box = _validate_box(page["mediaBoxPoints"], f"Fixture {fixture.id!r} page {label} MediaBox")
        crop_box = _validate_box(page["cropBoxPoints"], f"Fixture {fixture.id!r} page {label} CropBox")
        if not (
            media_box[0] <= crop_box[0] < crop_box[2] <= media_box[2]
            and media_box[1] <= crop_box[1] < crop_box[3] <= media_box[3]
        ):
            raise QualityDataError(f"Fixture {fixture.id!r} page {label} CropBox must be inside MediaBox.")
        if expected_crop_box is not None and crop_box != expected_crop_box:
            raise QualityDataError(f"Fixture {fixture.id!r} page {label} CropBox differs from matrix contract.")
        rotation = page["rotationDegrees"]
        if isinstance(rotation, bool) or rotation not in {0, 90, 180, 270}:
            raise QualityDataError(f"Fixture {fixture.id!r} page {label} has invalid rotation.")
        display_width = _positive_number(page["displayWidthPoints"])
        display_height = _positive_number(page["displayHeightPoints"])
        if display_width is None or display_height is None:
            raise QualityDataError(f"Fixture {fixture.id!r} page {label} has invalid display geometry.")
        crop_width = crop_box[2] - crop_box[0]
        crop_height = crop_box[3] - crop_box[1]
        expected_display = (crop_height, crop_width) if rotation in {90, 270} else (crop_width, crop_height)
        if not math.isclose(display_width, expected_display[0], abs_tol=1e-6) or not math.isclose(
            display_height, expected_display[1], abs_tol=1e-6
        ):
            raise QualityDataError(f"Fixture {fixture.id!r} page {label} display geometry disagrees with CropBox.")
        _validate_regions(page["regions"], f"Fixture {fixture.id!r} page {label}")
        if artifact_matrix:
            if not artifact_keys.issubset(page) or page["artifactKind"] not in {"pdf_table", "pdf_figure"}:
                raise QualityDataError(f"Fixture {fixture.id!r} page {label} has invalid artifact kind.")
            if not isinstance(page["artifactText"], str) or not page["artifactText"].strip():
                raise QualityDataError(f"Fixture {fixture.id!r} page {label} has empty artifact text.")
            if page["pixelClass"] not in {"table", "raster", "vector"}:
                raise QualityDataError(f"Fixture {fixture.id!r} page {label} has invalid pixel class.")
            _validate_normalized_region(page["sourceRegion"], f"Fixture {fixture.id!r} page {label} sourceRegion")
        else:
            _validate_optional_artifacts(fixture.id, label, page.get("artifacts"))


def _validate_optional_artifacts(fixture_id: str, page_label: str, raw_artifacts: object) -> None:
    if raw_artifacts is None:
        return
    if not isinstance(raw_artifacts, list) or not raw_artifacts:
        raise QualityDataError(f"Fixture {fixture_id!r} page {page_label} artifacts must be a non-empty list.")
    for artifact in raw_artifacts:
        if not isinstance(artifact, dict):
            raise QualityDataError(f"Fixture {fixture_id!r} page {page_label} artifact must be an object.")
        _require_keys(artifact, {"kind", "text", "regions"}, f"Fixture {fixture_id!r} page {page_label} artifact")
        if artifact["kind"] not in {"pdf_table", "pdf_figure"}:
            raise QualityDataError(f"Fixture {fixture_id!r} page {page_label} artifact has invalid kind.")
        if not isinstance(artifact["text"], str) or not artifact["text"].strip():
            raise QualityDataError(f"Fixture {fixture_id!r} page {page_label} artifact has empty text.")
        _validate_regions(artifact["regions"], f"Fixture {fixture_id!r} page {page_label} artifact")


def _validate_regions(raw_regions: object, context: str, *, require_labels: bool = False) -> None:
    if not isinstance(raw_regions, list) or not raw_regions:
        raise QualityDataError(f"{context} regions must be a non-empty list.")
    labels: set[str] = set()
    for region in raw_regions:
        label = _validate_normalized_region(region, f"{context} region", require_label=require_labels)
        if require_labels:
            if label in labels:
                raise QualityDataError(f"{context} region labels must be unique.")
            labels.add(label)


def _validate_normalized_region(raw_region: object, context: str, *, require_label: bool = False) -> str:
    if not isinstance(raw_region, dict):
        raise QualityDataError(f"{context} must be an object.")
    required_keys = {"x", "y", "width", "height"} | ({"label"} if require_label else set())
    _require_keys(raw_region, required_keys, context)
    if not require_label and set(raw_region) != required_keys:
        raise QualityDataError(f"{context} has unexpected fields.")
    label = raw_region.get("label", "")
    if require_label and (not isinstance(label, str) or not label):
        raise QualityDataError(f"{context} label must be non-empty.")
    values = [_finite_number(raw_region[key]) for key in ("x", "y", "width", "height")]
    if any(value is None for value in values):
        raise QualityDataError(f"{context} coordinates must be finite numbers.")
    x, y, width, height = (float(value) for value in values)
    if x < 0 or y < 0 or width <= 0 or height <= 0 or x + width > 1.000001 or y + height > 1.000001:
        raise QualityDataError(f"{context} must be a positive normalized rectangle.")
    return label


def _validate_box(raw_box: object, context: str) -> tuple[float, float, float, float]:
    if not isinstance(raw_box, list) or len(raw_box) != 4:
        raise QualityDataError(f"{context} must contain four coordinates.")
    values = [_finite_number(value) for value in raw_box]
    if any(value is None for value in values):
        raise QualityDataError(f"{context} coordinates must be finite numbers.")
    x0, y0, x1, y1 = (float(value) for value in values)
    if x1 <= x0 or y1 <= y0:
        raise QualityDataError(f"{context} must have positive dimensions.")
    return x0, y0, x1, y1


def _require_keys(payload: dict[str, object], keys: set[str], context: str) -> None:
    if set(payload) != keys:
        raise QualityDataError(f"{context} fields must be exactly {sorted(keys)}.")


def _finite_number(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        return None
    return float(value)


def _positive_number(value: object) -> float | None:
    number = _finite_number(value)
    return number if number is not None and number > 0 else None


def _positive_int(value: object) -> bool:
    return not isinstance(value, bool) and isinstance(value, int) and value > 0


def _ordered_counts(counter: Counter[str], keys: list[str]) -> dict[str, int]:
    return {key: counter.get(key, 0) for key in keys}
