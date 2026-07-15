from __future__ import annotations

import httpx
from fastapi import FastAPI, Response, status
from sqlalchemy import text

from ai_pdf_api.core.settings import settings
from ai_pdf_api.db.session import SessionLocal
from ai_pdf_api.routers.auth import router as auth_router
from ai_pdf_api.routers.chat import router as chat_router
from ai_pdf_api.routers.documents import router as documents_router
from ai_pdf_api.routers.jobs import router as jobs_router
from ai_pdf_api.routers.notes import router as notes_router
from ai_pdf_api.routers.workspaces import router as workspaces_router
from ai_pdf_api.services.storage import build_storage_client

app = FastAPI(title="AI PDF Workspace API")
app.include_router(auth_router)
app.include_router(workspaces_router)
app.include_router(documents_router)
app.include_router(chat_router)
app.include_router(jobs_router)
app.include_router(notes_router)


def _check_database() -> str:
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
        return "ok"
    except Exception:
        return "failed"


def _check_storage() -> str:
    try:
        build_storage_client().list_buckets()
        return "ok"
    except Exception:
        return "failed"


def _check_embedding_provider() -> str:
    try:
        if settings.embedding_provider == "ollama":
            response = httpx.get(
                f"{settings.ollama_base_url.rstrip('/')}/api/tags",
                timeout=min(settings.embedding_timeout_seconds, 5.0),
            )
        else:
            if not settings.openai_api_key:
                return "not_configured"
            base_url = settings.openai_api_base.rstrip("/")
            if not base_url.endswith("/v1"):
                base_url = f"{base_url}/v1"
            response = httpx.get(
                f"{base_url}/models",
                headers={"Authorization": f"Bearer {settings.openai_api_key}"},
                timeout=min(settings.embedding_timeout_seconds, 5.0),
            )
        return "ok" if response.is_success else "failed"
    except Exception:
        return "failed"


def _check_generation_provider() -> str:
    return "ok" if settings.generation_provider == "openai" and settings.openai_api_key else "not_configured"


def readiness_checks() -> dict[str, str]:
    return {
        "database": _check_database(),
        "objectStorage": _check_storage(),
        "embeddingProvider": _check_embedding_provider(),
        "generationProvider": _check_generation_provider(),
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "api"}


@app.get("/health/live")
def liveness() -> dict[str, str]:
    return {"status": "ok", "service": "api"}


@app.get("/health/ready")
def readiness(response: Response) -> dict[str, object]:
    checks = readiness_checks()
    ready = all(value == "ok" for value in checks.values())
    if not ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return {"status": "ok" if ready else "not_ready", "service": "api", "checks": checks}
