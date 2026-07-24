from __future__ import annotations

import json
from hashlib import sha256
from pathlib import Path

import pytest

from ai_pdf_api.services.multimodal_execution import build_multimodal_execution_report
from ai_pdf_api.services.multimodal_execution import (
    canonical_generation_messages_sha256,
    evaluate_real_model_output,
    load_multimodal_answer_oracle,
)
from ai_pdf_api.services.multimodal_quality import QualityDataError, load_multimodal_quality_suite


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
ARTIFACT_ROOT = REPOSITORY_ROOT / "docs/evals/artifacts/m402-v1"
SYSTEM_PROMPT = (
    "Answer only from supplied evidence. If it does not support the question, "
    "state that the selected assets do not contain supporting evidence."
)


def _golden():
    golden, _failures, _report = load_multimodal_quality_suite(
        REPOSITORY_ROOT,
        REPOSITORY_ROOT / "docs/evals/multimodal-golden-v1.json",
        REPOSITORY_ROOT / "docs/evals/multimodal-failures-v1.json",
    )
    return golden


def _real_model_payload() -> dict[str, object]:
    golden = _golden()
    oracle = load_multimodal_answer_oracle(
        REPOSITORY_ROOT,
        REPOSITORY_ROOT / "docs/evals/multimodal-answer-oracle-v1.json",
        golden,
    )
    golden_by_id = {case.id: case for case in golden.cases if case.layer == "answer"}
    fixture_by_id = {fixture.id: fixture for fixture in golden.fixtures}
    cases = []
    for oracle_case in oracle.cases:
        golden_case = golden_by_id[oracle_case.case_id]
        prompt_targets = [
            (target.fixture_id, target.locator_kind)
            for target in golden_case.evidence_targets
        ]
        if not prompt_targets:
            fixture_id = (
                golden_case.scope.selected_fixture_ids[0]
                if golden_case.scope.mode == "selected"
                else golden.fixtures[0].id
            )
            fixture = fixture_by_id[fixture_id]
            prompt_targets = [
                (fixture_id, "pdf_page" if fixture.modality == "pdf" else "image_region")
            ]
        prompt_concepts = " ".join(
            alternatives[0]
            for alternatives in oracle_case.required_prompt_concepts
        ) or "Synthetic fixture contains no answer for this question."
        context_blocks = [
            (
                f"[{index}] {Path(fixture_by_id[fixture_id].source_path).name}, "
                f"{locator_kind}\n"
                f"{prompt_concepts if index == 1 else 'Supporting target evidence.'}"
            )
            for index, (fixture_id, locator_kind) in enumerate(prompt_targets, start=1)
        ]
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Question:\n{golden_case.question}\n\n"
                    f"Asset evidence context:\n{'\n\n'.join(context_blocks)}"
                ),
            },
        ]
        output = (
            " ".join(golden_case.expected_answer_points)
            if golden_case.expected_disposition == "answer"
            else "The selected assets do not contain supporting evidence for that claim."
        )
        evaluation = evaluate_real_model_output(oracle_case, output)
        cases.append(
            {
                "caseId": golden_case.id,
                "question": golden_case.question,
                "generationMessages": messages,
                "generationMessagesSha256": canonical_generation_messages_sha256(messages),
                "provider": "openai",
                "model": "gpt-5.5",
                "output": output,
                "citationCoverage": [
                    {
                        "fixtureId": target.fixture_id,
                        "locatorKind": target.locator_kind,
                        "covered": True,
                    }
                    for target in golden_case.evidence_targets
                ],
                "matchedAnswerPoints": list(evaluation.matched_answer_points),
                "refusalMatched": evaluation.refusal_matched,
                "error": None,
                "passed": evaluation.passed,
            }
        )
    test_file = REPOSITORY_ROOT / "apps/worker/tests/test_multimodal_golden_execution.py"
    return {
        "schemaVersion": "m402-real-model-execution-v1",
        "goldenSchemaVersion": golden.schema_version,
        "testFile": test_file.relative_to(REPOSITORY_ROOT).as_posix(),
        "testFileSha256": sha256(test_file.read_bytes()).hexdigest(),
        "testNode": (
            "apps/worker/tests/test_multimodal_golden_execution.py::"
            "test_m402_worker_executes_every_golden_evidence_target"
        ),
        "cases": cases,
        "passed": True,
    }


def _write_payload(path: Path, payload: dict[str, object]) -> Path:
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


@pytest.fixture
def repository_real_model_path(tmp_path: Path):
    suffix = sha256(str(tmp_path).encode("utf-8")).hexdigest()[:12]
    path = ARTIFACT_ROOT / f".pytest-real-model-{suffix}.json"
    yield path
    path.unlink(missing_ok=True)


def test_m402_execution_report_accepts_worker_and_real_bff_artifacts() -> None:
    report = build_multimodal_execution_report(
        REPOSITORY_ROOT,
        _golden(),
        worker_path=ARTIFACT_ROOT / "worker-execution.json",
        desktop_path=ARTIFACT_ROOT / "playwright-desktop.json",
        mobile_path=ARTIFACT_ROOT / "playwright-mobile.json",
    )

    summary = report["summary"]
    assert {
        key: summary[key]
        for key in (
            "caseCount",
            "engineeringCaseCount",
            "fullStackEvidenceCaseCount",
            "desktopTargetCount",
            "mobileTargetCount",
            "screenshotCount",
            "scriptedAnswerCaseCount",
            "realModelAnswerCaseCount",
            "engineeringExecutionPassed",
            "fullStackEvidencePassed",
            "realModelQualityPassed",
            "releaseGatePassed",
        )
    } == {
        "caseCount": 21,
        "engineeringCaseCount": 21,
        "fullStackEvidenceCaseCount": 7,
        "desktopTargetCount": 8,
        "mobileTargetCount": 8,
        "screenshotCount": 16,
        "scriptedAnswerCaseCount": 7,
        "realModelAnswerCaseCount": 0,
        "engineeringExecutionPassed": True,
        "fullStackEvidencePassed": True,
        "realModelQualityPassed": False,
        "releaseGatePassed": False,
    }
    assert summary["minimumApprovedCoverageRatio"] >= 0.08
    assert summary["desktopRealBffResponseCount"] >= 20
    assert summary["mobileRealBffResponseCount"] >= 20
    assert len(report["cases"]) == 21
    assert len(report["artifacts"]) == 20
    assert report["pending"] == [
        "Run and approve real-model snapshots for all 7 answer/refusal cases."
    ]


def test_m402_execution_report_rejects_playwright_route_interception(tmp_path: Path) -> None:
    payload = json.loads((ARTIFACT_ROOT / "playwright-desktop.json").read_text(encoding="utf-8"))
    payload["routeInterceptions"] = 1
    tampered = tmp_path / "playwright-desktop.json"
    tampered.write_text(json.dumps(payload), encoding="utf-8")

    with pytest.raises(QualityDataError, match="routeInterceptions"):
        build_multimodal_execution_report(
            REPOSITORY_ROOT,
            _golden(),
            worker_path=ARTIFACT_ROOT / "worker-execution.json",
            desktop_path=tampered,
            mobile_path=ARTIFACT_ROOT / "playwright-mobile.json",
        )


def test_m402_execution_report_rejects_stale_test_source_hash(tmp_path: Path) -> None:
    payload = json.loads((ARTIFACT_ROOT / "playwright-desktop.json").read_text(encoding="utf-8"))
    payload["testFileSha256"] = "0" * 64
    tampered = tmp_path / "playwright-desktop.json"
    tampered.write_text(json.dumps(payload), encoding="utf-8")

    with pytest.raises(QualityDataError, match="test source hash drifted"):
        build_multimodal_execution_report(
            REPOSITORY_ROOT,
            _golden(),
            worker_path=ARTIFACT_ROOT / "worker-execution.json",
            desktop_path=tampered,
            mobile_path=ARTIFACT_ROOT / "playwright-mobile.json",
        )


def test_m402_execution_report_rejects_mocked_playwright_source(tmp_path: Path) -> None:
    payload = json.loads((ARTIFACT_ROOT / "playwright-desktop.json").read_text(encoding="utf-8"))
    mocked_test = REPOSITORY_ROOT / "apps/web/e2e/image-region-evidence.spec.ts"
    payload["testFile"] = mocked_test.relative_to(REPOSITORY_ROOT).as_posix()
    payload["testFileSha256"] = sha256(mocked_test.read_bytes()).hexdigest()
    tampered = tmp_path / "playwright-desktop.json"
    tampered.write_text(json.dumps(payload), encoding="utf-8")

    with pytest.raises(QualityDataError, match="must not intercept routes"):
        build_multimodal_execution_report(
            REPOSITORY_ROOT,
            _golden(),
            worker_path=ARTIFACT_ROOT / "worker-execution.json",
            desktop_path=tampered,
            mobile_path=ARTIFACT_ROOT / "playwright-mobile.json",
        )


def test_m402_execution_report_recomputes_golden_overlap(tmp_path: Path) -> None:
    payload = json.loads((ARTIFACT_ROOT / "playwright-desktop.json").read_text(encoding="utf-8"))
    target = payload["cases"][1]["targets"][0]
    target["renderedRegions"] = [{"x": 0.8, "y": 0.8, "width": 0.1, "height": 0.1}]
    target["minimumApprovedCoverageRatio"] = 1.0
    tampered = tmp_path / "playwright-desktop.json"
    tampered.write_text(json.dumps(payload), encoding="utf-8")

    with pytest.raises(QualityDataError, match="overlap result drifted"):
        build_multimodal_execution_report(
            REPOSITORY_ROOT,
            _golden(),
            worker_path=ARTIFACT_ROOT / "worker-execution.json",
            desktop_path=tampered,
            mobile_path=ARTIFACT_ROOT / "playwright-mobile.json",
        )


def test_m402_execution_report_independently_accepts_real_model_outputs(
    repository_real_model_path: Path,
) -> None:
    real_model_path = _write_payload(repository_real_model_path, _real_model_payload())

    report = build_multimodal_execution_report(
        REPOSITORY_ROOT,
        _golden(),
        worker_path=ARTIFACT_ROOT / "worker-execution.json",
        desktop_path=ARTIFACT_ROOT / "playwright-desktop.json",
        mobile_path=ARTIFACT_ROOT / "playwright-mobile.json",
        real_model_path=real_model_path,
    )

    assert report["summary"]["realModelAnswerCaseCount"] == 7
    assert report["summary"]["realModelQualityPassed"] is True
    assert report["summary"]["releaseGatePassed"] is True
    assert report["pending"] == []


def test_m402_execution_report_ignores_stale_runner_semantic_diagnostics(
    repository_real_model_path: Path,
) -> None:
    payload = _real_model_payload()
    payload["passed"] = False
    for case in payload["cases"]:
        case["matchedAnswerPoints"] = []
        case["refusalMatched"] = False
        case["passed"] = False
    real_model_path = _write_payload(repository_real_model_path, payload)

    report = build_multimodal_execution_report(
        REPOSITORY_ROOT,
        _golden(),
        worker_path=ARTIFACT_ROOT / "worker-execution.json",
        desktop_path=ARTIFACT_ROOT / "playwright-desktop.json",
        mobile_path=ARTIFACT_ROOT / "playwright-mobile.json",
        real_model_path=real_model_path,
    )

    assert report["summary"]["realModelAnswerCaseCount"] == 7
    assert report["summary"]["releaseGatePassed"] is True


@pytest.mark.parametrize(
    ("case_id", "forged_output"),
    [
        ("answer-pdf-table", "Atlas does not have a score of 91.4."),
        ("answer-pdf-chart", "The trend does not rise after the third point."),
        ("answer-image-trend", "Release 4 begins a sustained increase, not a sustained drop."),
        ("answer-image-constraint", "Verify the chart and caption separately, not together."),
        (
            "answer-mixed-compare",
            "The PDF says Release 4 begins a sustained drop. The image trend rises after the third point.",
        ),
        (
            "answer-refuse-pdf",
            "Atlas consumes 42 kWh, although that value is not mentioned in the fixtures.",
        ),
        (
            "answer-refuse-mixed",
            "The approving production customer was Acme, although it is not mentioned in the fixtures.",
        ),
    ],
)
def test_m402_execution_report_rejects_semantically_opposite_outputs(
    repository_real_model_path: Path,
    case_id: str,
    forged_output: str,
) -> None:
    payload = _real_model_payload()
    forged = next(case for case in payload["cases"] if case["caseId"] == case_id)
    golden_case = next(case for case in _golden().cases if case.id == case_id)
    forged["output"] = forged_output
    forged["matchedAnswerPoints"] = list(golden_case.expected_answer_points)
    forged["refusalMatched"] = golden_case.expected_disposition == "refuse"
    forged["passed"] = True
    real_model_path = _write_payload(repository_real_model_path, payload)

    with pytest.raises(QualityDataError, match="answer oracle failed"):
        build_multimodal_execution_report(
            REPOSITORY_ROOT,
            _golden(),
            worker_path=ARTIFACT_ROOT / "worker-execution.json",
            desktop_path=ARTIFACT_ROOT / "playwright-desktop.json",
            mobile_path=ARTIFACT_ROOT / "playwright-mobile.json",
            real_model_path=real_model_path,
        )


def test_m402_execution_report_rejects_nonproduction_prompt_fixture(
    repository_real_model_path: Path,
) -> None:
    payload = _real_model_payload()
    case = payload["cases"][0]
    case["generationMessages"] = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"Question: {case['question']}"},
    ]
    case["generationMessagesSha256"] = canonical_generation_messages_sha256(
        case["generationMessages"]
    )
    real_model_path = _write_payload(repository_real_model_path, payload)

    with pytest.raises(QualityDataError, match="production Chat prompt contract"):
        build_multimodal_execution_report(
            REPOSITORY_ROOT,
            _golden(),
            worker_path=ARTIFACT_ROOT / "worker-execution.json",
            desktop_path=ARTIFACT_ROOT / "playwright-desktop.json",
            mobile_path=ARTIFACT_ROOT / "playwright-mobile.json",
            real_model_path=real_model_path,
        )


def test_m402_execution_report_rejects_provider_configuration_drift(
    repository_real_model_path: Path,
) -> None:
    payload = _real_model_payload()
    payload["cases"][0]["provider"] = "scripted"
    real_model_path = _write_payload(repository_real_model_path, payload)

    with pytest.raises(QualityDataError, match="provider configuration drifted"):
        build_multimodal_execution_report(
            REPOSITORY_ROOT,
            _golden(),
            worker_path=ARTIFACT_ROOT / "worker-execution.json",
            desktop_path=ARTIFACT_ROOT / "playwright-desktop.json",
            mobile_path=ARTIFACT_ROOT / "playwright-mobile.json",
            real_model_path=real_model_path,
        )


def test_m402_execution_report_rejects_forged_prompt_hash(
    repository_real_model_path: Path,
) -> None:
    payload = _real_model_payload()
    payload["cases"][0]["generationMessagesSha256"] = "0" * 64
    real_model_path = _write_payload(repository_real_model_path, payload)

    with pytest.raises(QualityDataError, match="prompt hash drifted"):
        build_multimodal_execution_report(
            REPOSITORY_ROOT,
            _golden(),
            worker_path=ARTIFACT_ROOT / "worker-execution.json",
            desktop_path=ARTIFACT_ROOT / "playwright-desktop.json",
            mobile_path=ARTIFACT_ROOT / "playwright-mobile.json",
            real_model_path=real_model_path,
        )


def test_m402_complete_output_allowlist_rejects_every_unreviewed_suffix() -> None:
    golden = _golden()
    oracle = load_multimodal_answer_oracle(
        REPOSITORY_ROOT,
        REPOSITORY_ROOT / "docs/evals/multimodal-answer-oracle-v1.json",
        golden,
    )

    for oracle_case in oracle.cases:
        approved = oracle_case.accepted_complete_outputs[0]
        accepted = evaluate_real_model_output(oracle_case, f"{approved} [1]")
        rejected = evaluate_real_model_output(
            oracle_case,
            f"{approved} An additional unreviewed claim follows.",
        )

        assert accepted.passed is True, oracle_case.case_id
        assert rejected.passed is False, oracle_case.case_id
