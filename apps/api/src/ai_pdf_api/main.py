from fastapi import FastAPI

from ai_pdf_api.routers.auth import router as auth_router
from ai_pdf_api.routers.workspaces import router as workspaces_router

app = FastAPI(title="AI PDF Workspace API")
app.include_router(auth_router)
app.include_router(workspaces_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "api"}
