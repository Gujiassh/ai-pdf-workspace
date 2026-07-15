from fastapi.testclient import TestClient

import ai_pdf_api.main as main_module


def test_liveness_does_not_require_dependencies() -> None:
    client = TestClient(main_module.app)

    response = client.get("/health/live")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "api"}


def test_readiness_returns_dependency_status_and_503_when_unavailable(monkeypatch) -> None:
    monkeypatch.setattr(
        main_module,
        "readiness_checks",
        lambda: {
            "database": "ok",
            "objectStorage": "failed",
            "embeddingProvider": "ok",
            "generationProvider": "ok",
        },
    )
    client = TestClient(main_module.app)

    response = client.get("/health/ready")

    assert response.status_code == 503
    assert response.json() == {
        "status": "not_ready",
        "service": "api",
        "checks": {
            "database": "ok",
            "objectStorage": "failed",
            "embeddingProvider": "ok",
            "generationProvider": "ok",
        },
    }
