from pydantic import BaseModel, Field


class WorkspaceSummary(BaseModel):
    id: str
    name: str
    description: str | None
    role: str
    documentCount: int
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
