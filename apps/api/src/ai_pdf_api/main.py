from fastapi import FastAPI

from ai_pdf_api.routers.auth import router as auth_router
from ai_pdf_api.routers.documents import router as documents_router
from ai_pdf_api.routers.jobs import router as jobs_router
from ai_pdf_api.routers.workspaces import router as workspaces_router

app = FastAPI(title="AI PDF Workspace API")
app.include_router(auth_router)
app.include_router(workspaces_router)
app.include_router(documents_router)
app.include_router(jobs_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "api"}
