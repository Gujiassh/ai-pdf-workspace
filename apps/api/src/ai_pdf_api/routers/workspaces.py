from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ai_pdf_api.db.session import get_db
from ai_pdf_api.models import ChatThread, Document, User, Workspace, WorkspaceMembership
from ai_pdf_api.routers.deps import base_workspace_query_for_user, get_accessible_workspace, require_user_id
from ai_pdf_api.schemas.workspace import (
    CreateWorkspaceRequest,
    CreateWorkspaceResponse,
    WorkspaceDetailResponse,
    WorkspaceListResponse,
    WorkspaceSummary,
)

router = APIRouter(prefix="/v1/workspaces", tags=["workspaces"])


def require_existing_user(user_id: str, db: Session) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authenticated user not found.",
        )
    return user


def count_threads_for_workspaces(db: Session, workspace_ids: list[str]) -> dict[str, int]:
    if not workspace_ids:
        return {}
    rows = db.execute(
        select(ChatThread.workspace_id, func.count(ChatThread.id))
        .where(ChatThread.workspace_id.in_(workspace_ids), ChatThread.archived_at.is_(None))
        .group_by(ChatThread.workspace_id),
    ).all()
    return {workspace_id: count for workspace_id, count in rows}


def count_documents_for_workspaces(db: Session, workspace_ids: list[str]) -> dict[str, int]:
    if not workspace_ids:
        return {}
    rows = db.execute(
        select(Document.workspace_id, func.count(Document.id))
        .where(Document.workspace_id.in_(workspace_ids), Document.deleted_at.is_(None))
        .group_by(Document.workspace_id),
    ).all()
    return {workspace_id: count for workspace_id, count in rows}


def to_workspace_summary(
    workspace: Workspace, role: str, document_count: int = 0, thread_count: int = 0
) -> WorkspaceSummary:
    return WorkspaceSummary(
        id=workspace.id,
        name=workspace.name,
        description=workspace.description,
        role=role,
        documentCount=document_count,
        noteCount=0,
        threadCount=thread_count,
        createdAt=workspace.created_at.astimezone(UTC).isoformat(),
        updatedAt=workspace.updated_at.astimezone(UTC).isoformat(),
    )


@router.get("", response_model=WorkspaceListResponse)
def list_workspaces(
    user_id: str = Depends(require_user_id),
    db: Session = Depends(get_db),
) -> WorkspaceListResponse:
    require_existing_user(user_id, db)
    rows = db.execute(
        base_workspace_query_for_user(user_id).order_by(Workspace.updated_at.desc(), Workspace.created_at.desc()),
    ).all()
    workspace_ids = [workspace.id for workspace, _role in rows]
    counts = count_documents_for_workspaces(db, workspace_ids)
    thread_counts = count_threads_for_workspaces(db, workspace_ids)
    items = [
        to_workspace_summary(workspace, role, counts.get(workspace.id, 0), thread_counts.get(workspace.id, 0))
        for workspace, role in rows
    ]
    return WorkspaceListResponse(items=items, nextCursor=None)


@router.post("", response_model=CreateWorkspaceResponse, status_code=status.HTTP_201_CREATED)
def create_workspace(
    payload: CreateWorkspaceRequest,
    user_id: str = Depends(require_user_id),
    db: Session = Depends(get_db),
) -> CreateWorkspaceResponse:
    user = require_existing_user(user_id, db)
    now = datetime.now(UTC)
    workspace = Workspace(
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description else None,
        created_by_user_id=user.id,
        created_at=now,
        updated_at=now,
    )
    db.add(workspace)
    db.flush()

    membership = WorkspaceMembership(
        workspace_id=workspace.id,
        user_id=user.id,
        role="owner",
    )
    db.add(membership)
    db.commit()
    db.refresh(workspace)
    return CreateWorkspaceResponse(workspace=to_workspace_summary(workspace, membership.role, 0, 0))


@router.get("/{workspace_id}", response_model=WorkspaceDetailResponse)
def get_workspace(
    workspace_id: str,
    user_id: str = Depends(require_user_id),
    db: Session = Depends(get_db),
) -> WorkspaceDetailResponse:
    require_existing_user(user_id, db)
    workspace, role = get_accessible_workspace(db, user_id, workspace_id)
    document_count = count_documents_for_workspaces(db, [workspace.id]).get(workspace.id, 0)
    thread_count = count_threads_for_workspaces(db, [workspace.id]).get(workspace.id, 0)
    return WorkspaceDetailResponse(workspace=to_workspace_summary(workspace, role, document_count, thread_count))


@router.delete("/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
def archive_workspace(
    workspace_id: str,
    user_id: str = Depends(require_user_id),
    db: Session = Depends(get_db),
) -> Response:
    require_existing_user(user_id, db)
    workspace, role = get_accessible_workspace(db, user_id, workspace_id)
    if role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only workspace owners can archive this workspace.",
        )

    now = datetime.now(UTC)
    workspace.archived_at = now
    workspace.updated_at = now
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
