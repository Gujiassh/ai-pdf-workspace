from typing import Literal

from pydantic import BaseModel, Field

from ai_pdf_api.schemas.job import JobStatus


class AssetSummary(BaseModel):
    id: str
    workspaceId: str
    kind: str
    title: str
    sourceFilename: str
    mimeType: str
    byteSize: int
    status: str
    currentProcessingGeneration: int
    currentIndexVersion: int
    lastErrorCode: str | None
    lastErrorMessage: str | None
    createdAt: str
    updatedAt: str


class AssetListResponse(BaseModel):
    items: list[AssetSummary]
    nextCursor: str | None


class PdfPageOcrBlock(BaseModel):
    text: str
    x: float
    y: float
    width: float
    height: float


class PdfPageContent(BaseModel):
    pageNumber: int
    text: str
    charCount: int
    ocrBlocks: list[PdfPageOcrBlock] = Field(default_factory=list)


class PdfAssetDetail(BaseModel):
    kind: Literal["pdf"] = "pdf"
    pageCount: int
    pages: list[PdfPageContent]


class ImageAssetDetail(BaseModel):
    kind: Literal["image"] = "image"
    widthPixels: int
    heightPixels: int
    orientationApplied: bool


class AssetDetailResponse(BaseModel):
    asset: AssetSummary
    detail: PdfAssetDetail | ImageAssetDetail = Field(discriminator="kind")


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
    asset: AssetSummary
    upload: UploadDescriptor


class FinalizeUploadRequest(BaseModel):
    objectKey: str = Field(min_length=1, max_length=1024)


class FinalizeUploadResponse(BaseModel):
    asset: AssetSummary
    job: JobStatus
