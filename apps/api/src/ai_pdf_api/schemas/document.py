from pydantic import BaseModel, Field

from ai_pdf_api.schemas.job import JobStatus


class DocumentSummary(BaseModel):
    id: str
    workspaceId: str
    title: str
    sourceFilename: str
    mimeType: str
    byteSize: int
    pageCount: int | None
    status: str
    currentIndexVersion: int
    lastErrorCode: str | None
    lastErrorMessage: str | None
    createdAt: str
    updatedAt: str


class DocumentListResponse(BaseModel):
    items: list[DocumentSummary]
    nextCursor: str | None


class UploadDescriptor(BaseModel):
    method: str
    objectKey: str
    headers: dict[str, str]


class CreateUploadSessionRequest(BaseModel):
    sourceFilename: str = Field(min_length=1, max_length=512)
    mimeType: str = Field(min_length=1, max_length=255)
    byteSize: int = Field(gt=0)
    title: str | None = Field(default=None, max_length=255)


class CreateUploadSessionResponse(BaseModel):
    document: DocumentSummary
    upload: UploadDescriptor


class FinalizeUploadRequest(BaseModel):
    objectKey: str = Field(min_length=1, max_length=1024)


class FinalizeUploadResponse(BaseModel):
    document: DocumentSummary
    job: JobStatus
