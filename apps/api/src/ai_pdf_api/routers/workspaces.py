from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/v1/workspaces", tags=["workspaces"])


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


def build_workspace(
    workspace_id: str,
    name: str,
    description: str,
) -> WorkspaceSummary:
    now = datetime.now(UTC).isoformat()
    return WorkspaceSummary(
        id=workspace_id,
        name=name,
        description=description,
        role="owner",
        documentCount=0,
        noteCount=0,
        threadCount=0,
        createdAt=now,
        updatedAt=now,
    )


MOCK_WORKSPACES = [
    build_workspace(
        workspace_id="ws_demo_papers",
        name="论文阅读",
        description="用于论文阅读和方法总结的工作区",
    ),
    build_workspace(
        workspace_id="ws_demo_interview",
        name="面试资料",
        description="用于整理面试资料和问答记录的工作区",
    ),
]


@router.get("", response_model=WorkspaceListResponse)
def list_workspaces() -> WorkspaceListResponse:
    return WorkspaceListResponse(items=MOCK_WORKSPACES, nextCursor=None)


@router.get("/{workspace_id}", response_model=WorkspaceDetailResponse)
def get_workspace(workspace_id: str) -> WorkspaceDetailResponse:
    for workspace in MOCK_WORKSPACES:
        if workspace.id == workspace_id:
            return WorkspaceDetailResponse(workspace=workspace)

    raise HTTPException(status_code=404, detail="Workspace not found")
