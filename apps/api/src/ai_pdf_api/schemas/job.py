from pydantic import BaseModel


class JobStatus(BaseModel):
    id: str
    workspaceId: str
    assetId: str
    jobType: str
    status: str
    attemptCount: int
    queuedAt: str
    startedAt: str | None
    finishedAt: str | None
    errorCode: str | None
    errorMessage: str | None


class JobDetailResponse(BaseModel):
    job: JobStatus
