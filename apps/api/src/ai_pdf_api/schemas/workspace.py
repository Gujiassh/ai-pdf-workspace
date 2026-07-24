from pydantic import BaseModel, Field


class WorkspaceSummary(BaseModel):
    id: str
    name: str
    description: str | None
    systemPrompt: str
    retrievalTopK: int
    chunkSize: int
    embeddingProvider: str
    embeddingModel: str
    embeddingDimensions: int
    embeddingVersion: str
    generationProvider: str
    generationModel: str
    role: str
    assetCount: int
    noteCount: int
    threadCount: int
    createdAt: str
    updatedAt: str


class WorkspaceListResponse(BaseModel):
    items: list[WorkspaceSummary]
    nextCursor: str | None


class WorkspaceDetailResponse(BaseModel):
    workspace: WorkspaceSummary


class CreateWorkspaceRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=4000)


class CreateWorkspaceResponse(BaseModel):
    workspace: WorkspaceSummary


class UpdateWorkspaceSettingsRequest(BaseModel):
    systemPrompt: str = Field(min_length=1, max_length=12000)
    retrievalTopK: int = Field(ge=1, le=20)
    chunkSize: int = Field(ge=200, le=4000)


class WorkspaceSettingsResponse(BaseModel):
    workspace: WorkspaceSummary
