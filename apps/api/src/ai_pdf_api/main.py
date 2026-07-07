from fastapi import FastAPI

app = FastAPI(title="AI PDF Workspace API")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "api"}
